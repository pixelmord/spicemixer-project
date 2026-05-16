# Lifting content-ai into project-agnostic packages — 2026-05-15

Plan from the grilling session of 2026-05-15. Twelve design branches walked,
all decisions ratified. Replaces the prior assumption that `packages/content-ai`
stays Spicemixer-shaped.

## Goal

Lift the substrate of Spicemixer's AI content-suggestion stack into reusable
packages under `@pixelmord/*`, so that a second concrete consumer
(`pixelmord-hq`) can adopt it without copying code. The lift is justified by
**two real adapters** today, not hypothetical future ones — passing
LANGUAGE.md's "two adapters = real seam" test.

## Two consumers, validated

- **Spicemixer** (this repo): per-field AI proposers (`curate-*`,
  `extract-*`, `merge-*`, `generate-*`) over `EntityKind ∈ {ingredient,
recipe, pairing}`. File-based storage (sidecar JSON + meta sidecar).
  Astro action handlers. AI SDK v6 + `wrapLanguageModel` + ALS-carried
  `Origin`. Local JSONL trace + Sentry OTel sink.
- **pixelmord-hq** (`/Users/andreas.adam/workspace/@personal/pixelmordHQ/pixelmord-hq`):
  `categorizePost`, `deriveEntityFromPost`, `refreshDerivedEntityFromPost`,
  `suggestRelations`. Convex Node actions, raw OpenAI SDK, Convex DB
  tables. No event log or trace today.

Both use **fill** (cold-start from source) and **refine** (warm-start on
existing entity). pixelmord-hq's `deriveEntityFromPost` is fill;
`refreshDerivedEntityFromPost` is refine; Spicemixer's `extract-*` is
fill; `curate-*` is refine.

## The capability seam

Split along **fill vs refine**, not along EntityKind:

- **Fill** = ingest from source material into a fresh schema-valid entity.
  Source context (PDF text, post body, candidates) is the polymorphic
  input; output is `Partial<z.infer<Schema>>` plus an `ingested` event.
- **Refine** = operate on an existing schema-valid entity. Input is
  `currentData`, output is per-field suggestions plus
  `auto-applied | accepted | rejected` events.

Apply the deletion test on each:

- Remove fill → refine-only consumers carry no dead code. Seam.
- Remove refine → ingest-only consumers carry no dead code. Seam.
- Remove the shared substrate (Origin, ALS, TraceSink, AiEventLog
  interface, AI SDK provider wrapper, fingerprint hashing) → both fill and
  refine duplicate it. Substrate earns its keep.

Four adapters total (2 consumers × 2 capabilities) validate two seams.

## Three packages

| Package                        | Owns                                                                                                                                                                                  | Depends on |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `@pixelmord/content-ai-core`   | AI contract type, event log interface, trace sink interface, `Origin`, ALS setup, AI SDK provider wrapper, fingerprint hashing, suppression rules, `isPrunable` / `planPrune` helpers | AI SDK v6  |
| `@pixelmord/content-ai-ingest` | `runFill` runner, source-context type parameterisation, `ingested` event shaping, three-stage pipeline glue                                                                           | core       |
| `@pixelmord/content-ai-refine` | `runRefine` runner, preset resolution, per-field suggestion mapping, `accepted` / `rejected` / `auto-applied` event shaping                                                           | core       |

Naming: `content-ai-*` (not `ai-*`) because the scope is _typed content
operations_, not a generic LLM SDK.

Relations (Spicemixer's slug-detection, pixelmord-hq's vector-search
`suggestRelations`) **stay consumer-side** for now — the two
implementations are structurally different (LLM-on-text vs
embedding-retrieval) and the shared rule is too thin to justify a fourth
package today. Promote to `content-ai-relate` only if the consumer-side
adapters duplicate substantial logic.

## The AI contract type

```ts
type EntityRef = { kind: string; id: string };

type AutoApplyPolicy = { policy: "never" } | { policy: "high-confidence"; threshold: number }; // 0.85 per ADR 0004

type PromptContext<S extends ZodSchema, Source = never> = {
  field: FieldPath<S>;
  currentData?: Partial<z.infer<S>>;
  sourceContext?: Source; // typed-per-contract, only in fill
  preset?: ResolvedPreset;
  userPrompt?: string;
  rejectedSuggestions: Array<{
    // pre-fetched by runner from event log
    fieldPath: string;
    summary: string;
    at: string;
    reason?: string;
  }>;
  origin: Origin;
};

type Preset<S, Source> = {
  id: string; // "expand" | "research" | "translate-de" | ...
  label: string; // UI button text
  description?: string;
  instruction: string | ((ctx: PromptContext<S, Source>) => string);
  appliesTo: "text" | "array" | "enum" | "all" | FieldTypeMatcher;
  autoApplyOverride?: AutoApplyPolicy; // e.g. translate-* → "never"
};

type FieldWritePolicy<T> =
  | "preserve" // skip if currentData has value
  | "replace" // always overwrite (default for refine)
  | "fill-if-empty" // only fill empty fields (default for fill+currentData)
  | { mode: "merge-function"; merge: (current: T, proposed: T) => T } // your code does the merge
  | { mode: "merge-instructions"; instruction: string }; // the LLM does the merge per the instruction

type FieldConfig<S, Source> = {
  systemPrompt: (ctx: PromptContext<S, Source>) => string;
  autoApply: AutoApplyPolicy | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy);
  presetIds: string[]; // which contract-level presets apply here
  writePolicy?: FieldWritePolicy<unknown>; // baseline write policy; per-call args override
};

type AiContract<S extends ZodSchema, Source = never> = {
  schema: S;
  presets: Preset<S, Source>[]; // contract-level pool
  fields: Record<FieldPath<S>, FieldConfig<S, Source>>;
};
```

Key invariants:

- Schema stays a pure validator. AI metadata is **separate**, not embedded
  via `.meta()`. Non-AI callers don't carry prompt strings in their bundle.
- Field config is **per-contract**, not per-call. Per-call args are
  `userPrompt` and `preset` (id).
- Presets are **contract-level**; fields opt in via `presetIds`. DRY across
  fields, scoped per field.
- Source context is **typed-per-contract** — `Source` is a contract type
  parameter. Lives only in `-ingest`; `-refine` contracts use `never`.

## Runner signatures

```ts
// content-ai-refine
runRefine<S>({
  contract: AiContract<S>,
  currentData: z.infer<S>,
  target?: FieldPath<S>[],         // default: all eligible fields
  preset?: string,                 // preset id from contract.presets
  userPrompt?: string,             // free-text amendment, additive to preset
  origin: Origin,
}): Promise<{
  suggestions: Map<FieldPath<S>, FieldSuggestion<...>>,
  autoApplied: Map<FieldPath<S>, AppliedSuggestion>,
  traces: Map<string /* traceId */, TraceSummary>,
}>

// content-ai-ingest
runFill<S, Source>({
  contract: AiContract<S, Source>,
  sourceContext: Source,
  currentData?: z.infer<S>,        // cold-fill if absent; merge if present
  preset?: string,
  userPrompt?: string,
  writePolicy?: FieldWritePolicy<unknown>,                              // call-level default
  fieldPolicies?: Partial<Record<FieldPath<S>, FieldWritePolicy<unknown>>>, // per-field overrides
  origin: Origin,
}): Promise<{
  suggestions: Map<FieldPath<S>, FieldSuggestion<...>>,
  autoApplied: Map<FieldPath<S>, AppliedSuggestion>,
  traces: Map<string /* traceId */, TraceSummary>,
  ingestedEvent: AiEvent,
}>
```

`TraceSummary` is the editor-safe scalar view of an AI call, distinct from
the full trace record in JSONL/Sentry (ADR 0011 keeps payloads out of
editor-facing UI):

```ts
type TraceSummary = {
  traceId: string;
  model: string; // e.g. "claude-sonnet-4-6"
  runtimeMs: number;
  preset?: string;
  userPrompt?: string;
  confidence?: "high" | "medium" | "low";
};
```

Multiple suggestions can share one trace (one LLM call returns N fields →
all share `traceId`), so the map dedupes. UI surfaces this through a small
info-popover affordance on `InlineFieldSuggestion` and `AutoApplyBadge`.
Token counts and cost stay developer-grade — out of editor-facing UI.

`AppliedSuggestion` carries the same shape information the `accepted`/
`auto-applied` event needs:

```ts
type AppliedSuggestion = {
  value: unknown; // typed against the field's schema slot at use site
  hash: string; // for suppression + undo correlation
  summary: string; // for UI display
  confidence: "high" | "medium" | "low";
};
```

The runner pre-mutates `currentData` for auto-applied fields before returning
(both runners), so consumers receive the post-apply view in `currentData`'s
mental model. The `autoApplied` map is the audit channel — UI surfaces it
via inline badges with undo affordance (undo revertable until form save;
post-save reverts are edits, not undos). Reverting an auto-apply emits a
`rejected` event for the hash so future runs suppress it.

Per-field write-policy resolution at runtime, in priority order:
`fieldPolicies[field]` → call-level `writePolicy` → `contract.fields[field].writePolicy`
→ mode default (`fill-if-empty` for fill+currentData, `replace` for refine,
no-op for cold-fill). The runner enforces the resolved policy: `preserve` and
`fill-if-empty`-with-value skip the field's LLM call entirely; `merge-function`
runs the LLM normally and post-processes; `merge-instructions` injects the
instruction into the assembled system prompt and passes `currentData` via
`PromptContext`.

Both runners return `Map<FieldPath, FieldSuggestion>` — single-field calls get
a one-entry map, cold-fill returns a densely-populated map (all schema-valid
fields proposed), refine returns sparse maps (only fields the user targeted).
The runner decides internally whether to make one LLM call returning all
targets or N parallel calls; consumers don't control this.

`runFill` covers three patterns:

- **Cold-fill** — no `currentData`. Output is a proposal for a fresh entity.
- **Merge** — `currentData` present. Output respects per-field write policies
  (see `FieldConfig.writePolicy` below) when reconciling source-derived values
  with existing values.
- **Hybrid** — `currentData` partially populated. Each field's `writePolicy`
  determines whether the field is overwritten, preserved, filled-if-empty, or
  custom-merged.

`runFill` additionally returns the `ingestedEvent` as a sibling — the audit
record that a fill happened, separable from the suggestion payload itself.
Consumers persist it through their `AiEventLog` adapter.

```ts
type FieldSuggestion<T> =
  | {
      kind: "single";
      value: T; // typed against the field's schema slot
      confidence: "high" | "medium" | "low";
      summary: string;
      hash: string; // first-12-hex SHA-256, for suppression
      traceId: string; // bridge to AI Trace
    }
  | {
      kind: "choice";
      candidates: Array<{
        value: T; // each candidate typed against the slot
        summary: string;
        hash: string; // per-candidate, so suppression is per-pick
        confidence?: "high" | "medium" | "low";
      }>;
      choose: 1 | { min: number; max: number }; // single- or multi-select
      traceId: string;
    };
```

`kind: "single"` covers the common case (one proposed value per field). `kind:
"choice"` covers multi-candidate fields where the user picks from N candidates
— images ("here are 4 image candidates, pick one"), alternative phrasings of a
paragraph, multi-image galleries (`choose: { min: 1, max: 4 }`). Each
candidate carries its own hash so the event log can suppress specific
previously-rejected candidates without nuking the whole choice set. Renderer
dispatch (text row vs tag chips vs image grid) keys off the field's schema
slot type **and** the suggestion's `kind`. Event-log shape unchanged: a
`choice` acceptance emits an `accepted` event for the chosen candidate's hash;
non-picked candidates may emit `rejected` events when the user explicitly
rejects them.

## Storage adapters

Two interfaces, both injected at runner construction. Package owns the
rules; consumer owns the bytes.

```ts
interface AiEventLog {
  read(ref: EntityRef): Promise<AiEvent[]>;
  append(ref: EntityRef, event: AiEvent): Promise<void>;
}

interface TraceSink {
  write(record: AiTraceRecord): Promise<void> | void;
}
```

**Pruning is adapter-side.** Core exports `isPrunable(event)` (false for
`rejected` and `ingested` — ADR 0004) and `planPrune(events, capHint?)`.
Adapters that have size pressure (Spicemixer's file-JSON sidecars) call
`planPrune` before write. Adapters that don't (Convex DB rows, KV stores,
event-stream DBs) just append. The "never re-surface rejected" rule lives
in core's `isPrunable` and cannot be violated by mistake.

Spicemixer ships `SidecarEventLog` + `FileTraceSink` + `SentrySpanSink`
adapters (today's logic, lifted into a thin Spicemixer-side wrapper).
pixelmord-hq writes `ConvexEventLog` + (probably) `ConvexTraceSink`.

## Origin and ALS

`Origin` envelope and `AsyncLocalStorage` setup live in core. Both runtimes
support ALS (Node.js semantics in Astro and in Convex Node actions). Core
exports:

```ts
export const originContext: AsyncLocalStorage<Origin>;
export function withOrigin<T>(origin: Origin, fn: () => Promise<T>): Promise<T>;
```

Each consumer wraps its entry boundary:

- Spicemixer: Astro action handlers wrap with `withOrigin({...}, () => handlerBody())`.
- pixelmord-hq: Convex action handlers wrap with the same. `runId` is
  generated per top-level action call; multi-step flows share it.

Core does **not** ship framework-specific helpers. `withOrigin` is the
single primitive. Framework adapters (if ever needed) are separate
sub-packages, not core.

## Modes — collapsed into presets

Original "mode: fill | rewrite | translate" enum dissolved during grilling.
The capability axis (fill vs refine) is the package split. The
user-facing-intent axis (expand, change tone, translate, research, …) is
the preset list on the contract. There is no separate `mode` parameter on
the runners — the runner doesn't dispatch on intent, the prompt builder
does, and the prompt builder reads `ctx.preset`.

Knock-on: the never-auto-apply-translate rule from ADR 0004 lives on the
`translate-*` preset's `autoApplyOverride`, not as a runner branch.

## What stays Spicemixer-side

- `apps/website/src/lib/stores/` — `LocalFsStore`, sidecar I/O. Implements
  `ContentStore` (ADR 0006), not affected by the lift.
- `apps/website/src/lib/sidecar-event-log.ts` (new) — Spicemixer's
  adapter implementing `AiEventLog` over the sidecar. Calls core's
  `planPrune` before write.
- `apps/website/src/lib/trace/` (relocate from `packages/content-ai/src/trace/`) —
  `FileTraceSink`, `SentrySpanSink`, scrub layer. These could _potentially_
  live in core as defaults, but per Q4 we keep them adapter-side to avoid
  "default leakage" into the interface.
- `apps/website/src/contracts/` (new) — Spicemixer's three AI contracts
  (`ingredientContract`, `recipeContract`, `pairingContract`), with their
  schemas, presets, field configs.
- `packages/entity-kind` — survives, but its scope narrows. Today it owns
  schemas + proposers + diff + completeness + routePrefix. After the lift:
  schemas + diff + completeness + routePrefix stay here (Spicemixer
  workflow concerns); proposers fold into the per-kind contract's field
  configs. **Open follow-up**: does `entity-kind` still warrant being a
  separate package now that nothing outside `apps/website` consumes it?
  Probably fold into `apps/website/src/` — but defer the decision until
  the lift is in motion.
- `packages/recipe-ingestion` — survives, becomes a consumer of
  `content-ai-ingest` rather than calling AI SDK directly.

## What stays pixelmord-hq-side

- Convex schemas (`_generated/dataModel`, `derivedEntities`,
  `derivedEntitySearch`, `articles`, `captures`).
- `ConvexEventLog`, `ConvexTraceSink` adapters — implement the core
  interfaces against Convex tables.
- `convex/curation/` actions — rewritten as thin Convex wrappers that:
  call `withOrigin(...)`, invoke `runFill` or `runRefine` from the
  lifted packages, and write results via Convex mutations.
- The contract definitions for `project`, `idea`, `todo`, `worklog`,
  `habitlog`, `article`, `reference` — schemas + field configs + presets.
  Lives in `apps/convex-server/convex/curation/contracts/`.
- `suggestRelations` (vector-search retrieval) — stays as-is until/unless
  the relations capability gets a fourth package.

## Open follow-ups

These didn't get nailed in this session; resolve when the lift begins:

1. **`packages/entity-kind` survival.** After the lift, it has one consumer
   (`apps/website`). Justification for a separate package weakens. Fold or
   keep? Default: fold into `apps/website/src/`, but check ADR 0008's
   dependency-direction reasoning still holds.
2. **AutoApply execution site.** Per-field `autoApply` policy resolution
   happens where — in the runner (so the runner returns
   `{ suggestion, autoApplied: boolean }`) or in the consumer (runner
   returns the policy result, consumer decides whether to apply)? Probably
   runner-side for symmetry with suppression filtering, but confirm.
3. **AI Trace sinks in core vs adapters.** `FileTraceSink` could live in
   core as a default. Decided to keep adapter-side for now to avoid
   default-leakage. Revisit if every consumer reimplements it identically.
4. **Contract registration vs values.** No registry today — contracts are
   just values, consumers maintain their own dispatch. Confirm this stays
   the case (no `core.registerContract(...)` pattern).
5. **Event ID generation.** Core generates event IDs (so `planPrune` can
   reference them), or adapter generates them on append? Default:
   core-generated UUIDs, adapter persists as-is.
6. **Locking / concurrent writes.** Spicemixer's file-based adapter needs
   per-entity locking on append (read-prune-write race). Convex adapter
   needs none. Document the contract: append must be serializable per
   `entityRef`.
7. **Spicemixer forms migration.** Spicemixer's `IngredientForm`,
   `RecipeForm`, `PairingForm` use bare `useState`. To consume the UI
   registry's `InlineFieldSuggestion` pattern cleanly, migrate forms to
   `@tanstack/react-form` (which gives per-field `useField`-style scoped
   setters). Prerequisite-or-parallel to adopting the registry inline
   suggestion components.

## Suggested migration sequence

Not committed; this is one viable order.

1. **In Spicemixer, deepen first** — execute architecture-deepening
   candidate (1) AiEventLog as a stateful module _inside_ `packages/content-ai`,
   without yet lifting. Validate the rules + storage seam holds within
   Spicemixer before promoting it across two consumers.
2. **Carve out core** — extract event log rules, trace interface, AI
   contract type, Origin/ALS, AI SDK provider wrapper into
   `packages/content-ai-core` inside the Spicemixer monorepo. Spicemixer
   still uses it. Don't publish yet.
3. **Carve out refine** — extract the refine runner + preset machinery
   into `packages/content-ai-refine`. Rewrite Spicemixer's `curate-*`
   proposers as field configs on `ingredientContract` /
   `recipeContract` / `pairingContract`. Validate against the existing
   admin UI.
4. **Carve out ingest** — extract the fill runner + source-context
   machinery into `packages/content-ai-ingest`. Rewrite Spicemixer's
   `extract-*` proposers + the recipe-ingestion package as consumers.
5. **Publish to a private npm registry or use pnpm workspace symlinks
   across the two project monorepos.** Either works; pick based on
   release cadence preferences.
6. **In pixelmord-hq, write adapters** — `ConvexEventLog`,
   `ConvexTraceSink`, convert raw OpenAI calls to AI SDK + the runner
   API. Migrate `categorizePost` → refine contract, `deriveEntityFromPost`
   → fill contract, `refreshDerivedEntityFromPost` → refine contract.
7. **`suggestRelations` stays untouched.** Wire it to share the
   `Origin` envelope so its trace records bridge with refine/fill
   records, but its retrieval logic stays Convex-native.

## When to ADR this

Once step 2 is committed (core package exists, even unpublished), write
ADR 0016 "AI substrate is a separate package, not Spicemixer code"
(ADR 0014 and 0015 were claimed by the 2026-05-16 translation-flow
work for pairings folder-per-locale and translation-flow architecture).
Mandatory because:

- **Hard to reverse** — once Spicemixer depends on `content-ai-core` as
  an external package and pixelmord-hq does too, restructuring the
  package boundary breaks both consumers.
- **Surprising without context** — future code archaeology will ask "why
  isn't this in `apps/website/src/lib/ai/`?" The answer is "two real
  consumers, separate-package was earned, not speculative."
- **Real trade-off** — alternative was a monorepo-internal lift that
  doesn't publish. We're choosing publish-able-shape over
  monorepo-internal-shape because the two consumers live in different
  repos.

## Cross-references

- ADR 0004 — AI auto-apply boundary (event log shape, suppression rule)
- ADR 0006 — persistence adapter (parallel pattern: rules vs bytes)
- ADR 0008 — EntityKind seam (the within-Spicemixer unification this
  builds on)
- ADR 0011 — AI observability (trace stack lifts wholesale)
- ADR 0012 — source artifact storage (relevant for `content-ai-ingest`)
- ADR 0013 — meta sidecar carries workflow state (event log payload site)
- `docs/plans/2026-05-15-architecture-deepening-candidates.md` — sibling
  plan. Candidate (1) AiEventLog overlaps with step 1 of this lift's
  migration sequence.
