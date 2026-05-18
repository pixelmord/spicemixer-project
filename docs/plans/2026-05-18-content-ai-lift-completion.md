# Completing the content-ai package lift — 2026-05-18

Successor to `2026-05-15-content-ai-package-lift.md`. Plan from the
grilling session of 2026-05-18, conducted after the initial lift work
landed partially. Closes the remaining gaps between the 2026-05-15 plan
and the implemented state of `packages/content-ai-{core,ingest,refine}`

- the residual `packages/content-ai`.

**On completion, delete `docs/plans/2026-05-15-content-ai-package-lift.md`** —
it is superseded in full. The 2026-05-16 translation-flow plan and the
2026-05-15 ui-registry plan stand unchanged; this plan does not touch
the translation or UI surfaces beyond what the lift requires.

## End state

`packages/content-ai` is deleted. Spicemixer consumes only:

- `@pixelmord/content-ai-core`
- `@pixelmord/content-ai-ingest`
- `@pixelmord/content-ai-refine`
- Website-side adapters in `apps/website/src/lib/` (see Q8 below)
- Six per-kind website-side wrappers in `apps/website/src/lib/ai/`

pixelmord-hq consumes only the three `@pixelmord/content-ai-*` packages
plus its own Convex-side adapters (per the 2026-05-15 lift plan).

## Decisions

### Q1 — Origin / ALS unification (G1, G2)

Big-bang migrate every consumer off the old `content-ai/trace/origin.ts`
module. Single `AsyncLocalStorage<Origin>` lives in
`@pixelmord/content-ai-core/origin.ts`.

- `withOrigin(origin, fn)` is the direct invocation form.
- `wrapWithOrigin(config)` is the curried-factory replacement for the
  old `withOrigin(config)` pattern used by Astro action handlers.
- `runWithOrigin` is renamed to `withOrigin` (direct form) — call sites
  rewritten.
- `getCurrentOrigin` re-exported from core only.
- Old `content-ai/trace/origin.ts` deleted.

Migration affects: `apps/website/src/actions/index.ts` (~22 call sites),
`apps/website/src/pages/api/ai/refresh-suggestions/stream.ts`,
`apps/website/src/pages/api/ai/generate-recipe/stream.ts`,
`apps/website/src/lib/ai/runner.ts`, all tests under
`apps/website/tests/`.

### Q2 — Tracing middleware (G3)

`tracingMiddleware(sinks)` lifts from `content-ai/trace/middleware.ts`
into `@pixelmord/content-ai-core/trace.ts` alongside the existing
`TraceSink`/`TraceEvent` types.

`createProvider(config, options?: { sinks?: TraceSink[] })` wraps the
returned `LanguageModel` with `wrapLanguageModel(model, tracingMiddleware(sinks))`
internally when sinks are present. Both runners (`runFill`, `runRefine`)
therefore emit trace events without per-call wiring.

`trace/ids.ts` (`generateTraceId`) lifts to core alongside the
middleware.

### Q3 — Source attribution on AiEvent (G4)

`sourceDescriptorSchema` and `normalizeSourceField` lift from
`content-ai/schemas/ai-events.ts` into `@pixelmord/content-ai-core/events.ts`.

`aiEventSchema` regains:

```ts
source: z.union([z.string(), sourceDescriptorSchema]).optional();
```

`IngestAiEvent` in `@pixelmord/content-ai-ingest/types.ts` gains the
same field. The `ingested` event becomes self-describing: both
Spicemixer's sidecar event log and pixelmord-hq's Convex event log
carry source attribution uniformly.

### Q4 — Auto-apply policy unification (G7)

The kind-based allowlist (`AutoApplyKind`, `ALLOWLIST`,
`isAllowedAutoApply`, `assertAutoApplyAllowed`) is deleted entirely.
Each `FieldConfig.autoApply: AutoApplyPolicy` is the single source of
truth.

Fields default to `{ policy: "never" }` when `autoApply` is omitted
(already implemented in `resolveAutoApply`).

The community-block rule (old `origin === "community"` short-circuit)
is also dropped — no community-ingestion surface exists today in either
consumer. `Origin.triggeredBy` stays `"editor" | "system"`. Re-add
`"community"` + a cross-cutting runner rule only when a community
surface actually ships.

The sibling-locale auto-apply-never rule (ADR 0015) remains as the only
cross-cutting policy override in the runner.

### Q5 — PromptContext restoration (G6)

`PromptContext<S, Source>` in `@pixelmord/content-ai-core/contract.ts`
restored to the plan's spec, with all fields **required**:

```ts
interface PromptContext<S, Source> {
  field: FieldPath<S>;
  currentData?: Partial<z.infer<S>>;
  sourceContext?: Source;
  preset?: ResolvedPreset; // resolved object, not id
  userPrompt?: string;
  rejectedSuggestions: Array<{
    // empty array when none
    fieldPath: string;
    summary: string;
    at: string;
    reason?: string;
  }>;
  origin: Origin;
}
```

Runner responsibilities:

- Pre-fetch rejected events for the entity via the injected
  `AiEventLog` and shape into `rejectedSuggestions` before calling
  `systemPrompt(ctx)`.
- Resolve `preset` id (per-call arg) → full `ResolvedPreset` object
  before invoking `systemPrompt(ctx)`.
- Thread `field` per-call (one call per target field).
- Read `origin` from ALS via `getCurrentOrigin()`; throw if absent (no
  silent fallback).

Breaking change: Spicemixer's three contracts
(`apps/website/src/contracts/{ingredient,recipe,pairing}Contract.ts`)
get their `systemPrompt(ctx)` signatures rewritten to consume the new
shape. Existing manual `buildRejectedContext` concatenation in those
prompts removed — runner now provides it via `ctx.rejectedSuggestions`.

### Q6 — AiEventLog interface (G5)

- **`EntityRef { kind: string; id: string }`** is canonical. Spicemixer's
  adapter constructs `id` as a stringified composite
  (`"recipe/en/cucumber-salad"`) and parses it internally; Convex uses
  the doc id directly. No generics propagate through runner signatures.
- **`append(ref, Omit<AiEvent, "at" | "id">)`** — core stamps `at` (ISO
  timestamp) and `id` (UUID via `crypto.randomUUID()`) before
  persisting. Adapters never invent these.
- **`AiEvent.id: string`** becomes a required field. Required so
  `planPrune` can reference stable identities and so cross-log
  correlation is possible.
- **No backfill.** Existing on-disk aiEvents are deleted as part of the
  migration — content is still test material per user confirmation. The
  schema bump is treated as a hard cut, not a migration.

`MetaRef {collection, locale?, slug}` stays website-side as the
Spicemixer-internal key shape; the `SidecarEventLog` constructor
accepts a `MetaRef`-shaped writer but exposes the `AiEventLog` (with
string `EntityRef`) to the runner.

The four old method signatures (`shouldSkip`, `buildRejectedContext`)
disappear from the interface — those become standalone helpers in core
(`isSuppressed`, `buildRejectedContext` already exist; consumers call
them directly with `await log.read(ref)`).

### Q7 — Per-kind functions, output schemas, duplicate contracts (G15, G16, G17)

**Per-kind functions.** Six thin website-side wrappers replace the old
`content-ai` implementations:

- `apps/website/src/lib/ai/extract-recipe.ts`
- `apps/website/src/lib/ai/extract-ingredient.ts`
- `apps/website/src/lib/ai/extract-pairing.ts`
- `apps/website/src/lib/ai/merge-recipe.ts`
- `apps/website/src/lib/ai/merge-ingredient.ts`
- `apps/website/src/lib/ai/merge-pairing.ts`
- `apps/website/src/lib/ai/generate-recipe.ts`

Each owns Spicemixer-specific source prep (PDF reading, image fetching,
hashing into `SourceDescriptor`, building the ingest `MessageSet`) and
ends with a `runFill` (or `runRefine` for merge) call. Action handlers
in `actions/index.ts` become thin RPC shells around these wrappers.

The three `translate*Fields` functions are **deleted** outright — the
broken per-field translation flow is superseded by ADR 0015's
`runFill` + sibling-locale source.

**Output schemas.** `schemas/{ingredient,recipe,pairing}-extract.ts`
and `schemas/preprocess.ts` move to
`apps/website/src/contracts/schemas/`, colocated with the contract
files that reference them via `FieldConfig.outputSchema`.

**Duplicate contracts.** `packages/content-ai/src/contracts/` is
verified-then-deleted. Step 1: confirm no live caller imports
`ingredientFieldConfig` / `recipeFieldConfig` / `pairingFieldConfig`
from `content-ai`. Step 2: delete the directory.

### Q8 — Cleanup (G11, G14, plan #6)

| Old location                                                                                          | Destination                                                 |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `content-ai/field-diff.ts`                                                                            | `@pixelmord/content-ai-core`                                |
| `content-ai/translation.ts` (schema + `resolveTranslation`)                                           | `@pixelmord/content-ai-core`                                |
| `content-ai/entity-meta.ts`                                                                           | `apps/website/src/lib/entity-meta.ts`                       |
| `content-ai/testing/in-memory-event-log.ts`                                                           | `@pixelmord/content-ai-core/testing` (subpath export)       |
| `content-ai/event-log.ts` (`SidecarEventLog` + per-entity locking)                                    | `apps/website/src/lib/sidecar-event-log.ts`                 |
| `content-ai/trace/sinks/{file,sentry,pubsub}.ts`                                                      | `apps/website/src/lib/trace/`                               |
| `content-ai/source-store/*` (`LocalSourceStore`, `InMemorySourceStore`, `hashBinary`)                 | `apps/website/src/lib/source-store/`                        |
| `content-ai/pdf.ts`                                                                                   | `apps/website/src/lib/pdf.ts`                               |
| `content-ai/search-images.ts`                                                                         | `apps/website/src/lib/search-images.ts`                     |
| `content-ai/pubsub.ts`                                                                                | `apps/website/src/lib/pubsub.ts`                            |
| `content-ai/debug.ts`                                                                                 | `apps/website/src/lib/ai-debug.ts`                          |
| `content-ai/image.ts`                                                                                 | `apps/website/src/lib/image.ts`                             |
| `content-ai/errors.ts` (`AiError`)                                                                    | `@pixelmord/content-ai-core`                                |
| `content-ai/hash.ts` (extras: `hashSuggestion`, `hashContent`)                                        | `@pixelmord/content-ai-core` as aliases on existing helpers |
| `content-ai/provider.ts` (`resolveConfig`)                                                            | `@pixelmord/content-ai-core`                                |
| `content-ai/events.ts` (remaining helpers: `prune`, `appendEvent`, `recordAiEvent`, `hasAutoApplied`) | `@pixelmord/content-ai-core/events.ts`                      |

**Locking contract.** `AiEventLog` interface in core gains a doc
comment: _"append must be serializable per `entityRef`; concurrent
appends to the same ref must not interleave read-prune-write cycles."_
Spicemixer's `SidecarEventLog` keeps its process-local `pendingAppends`
map; Convex adapter relies on Convex's own serialization. Core does not
ship a locking primitive.

## Migration sequence

Split into two commits for bisectability:

1. **Substrate lift (one commit, no consumer code changes).**
   - Implement Q1–Q8 destination moves: lift everything destined for
     `@pixelmord/content-ai-*` packages into those packages.
   - In `packages/content-ai`, replace each lifted module's
     implementation with a re-export from the new package.
   - Old barrel (`packages/content-ai/src/index.ts`) keeps working;
     every consumer continues to compile unchanged.
   - Delete obsolete files only where their re-export shim adds no
     value (e.g. `trace/origin.ts` if its three symbols are pure
     re-exports).
   - Tests pass without changes.

2. **Consumer rewrite + old package deletion (one commit).**
   - Rewrite every import in `apps/website/`, `apps/registry/`,
     `packages/entity-kind/`, `packages/recipe-ingestion/` to point at
     `@pixelmord/content-ai-{core,ingest,refine}` or
     `apps/website/src/lib/*`.
   - Rewrite `withOrigin(config)` call sites in `actions/index.ts`
     (~22 of them) to `wrapWithOrigin(config)`; rewrite
     `runWithOrigin(o, fn)` in the two stream endpoints to
     `withOrigin(o, fn)`.
   - Rewrite three contract `systemPrompt(ctx)` signatures for the new
     required PromptContext fields.
   - Delete on-disk aiEvents (test content only).
   - Update test mocks (`translateIngredientFields` /
     `translateRecipeFields` / `translatePairingDescription` mocks in
     `ai-contract.test.ts`, `contract-refine-integration.test.ts`
     become mocks of the new website-side wrappers or `runFill`).
   - Delete `packages/content-ai/` entirely.
   - Update `package.json` workspaces if needed.

## Post-completion cleanup

- **Delete `docs/plans/2026-05-15-content-ai-package-lift.md`** — fully
  superseded by this plan.
- Verify ADR 0017 ("AI substrate is a separate package") wording still
  matches the end state; amend if needed.
- Update `CONTEXT.md` if it references `packages/content-ai`.

## Cross-references

- `docs/plans/2026-05-15-content-ai-package-lift.md` — **superseded by
  this plan; delete on completion.**
- `docs/plans/2026-05-15-content-ai-ui-registry.md` — stands; this plan
  does not touch the UI substrate.
- `docs/plans/2026-05-16-content-ai-translation-flow.md` — stands;
  translation flow rides on the substrate this plan completes.
- ADR 0004 — AI auto-apply boundary; kind-allowlist deletion narrows
  the rule surface but doesn't supersede the ADR.
- ADR 0011 — AI observability; `tracingMiddleware` lifting to core is
  the substrate side of this ADR's trace stack.
- ADR 0015 — Translation flow; sibling-locale auto-apply-never rule
  remains the only cross-cutting runner override.
- ADR 0017 — AI substrate as a separate package; this plan completes
  the lift the ADR locks in.
