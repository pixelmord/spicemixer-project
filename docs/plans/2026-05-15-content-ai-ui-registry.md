# UI registry for content-ai suggestions — 2026-05-15

Sibling plan to `docs/plans/2026-05-15-content-ai-package-lift.md`. The lift
plan splits the AI substrate into three publishable npm packages
(`@pixelmord/content-ai-core/-ingest/-refine`). This plan adds the **UI
substrate** the consumers need to render AI suggestions on top of those
packages.

## Goal

Ship a **shadcn-style code registry** (not an npm package) that provides
primitives, blocks, and an orchestration hook for AI-suggestion review.
Both known consumers (Spicemixer, pixelmord-hq) need this UI surface;
both use React + Tailwind + shadcn-ui (base-ui flavour). A third consumer
with a different stack can fork the pasted components.

Justification by the same "two real adapters = real seam" test the lift
plan applies: Spicemixer has ~2,000 lines of AI-suggestion UI today
(`AiAssistPanel`, `EnhanceModal`, `TranslateModal`, `InlineSuggestion`,
`CompletenessPanel`, `DiffPreviewModal`, plus four `*Diff` components).
pixelmord-hq will need an equivalent surface when it adopts the lifted
packages. Two consumers; real seam.

## Distribution shape: shadcn-style registry, not npm package

Reasoning: UI is the part of a system you most need to **own and modify**.
shadcn's thesis. Both consumers' framing ("modify or adjust to their
needs") aligns with the shadcn model, not the npm-package model.

- **Registry name**: `@pixelmord/ui-registry`. Generic enough to host
  non-AI-suggestion UI primitives later (form helpers, diff viewers).
- **Distribution mechanism**: shadcn registry schema (`registry.json` +
  `r/<item>.json` source files served from HTTPS). Consumers run
  `pnpm dlx shadcn@latest add <url>` to paste components into their repo.
- **Hosting**:
  - **Step 1-5 of the lift's migration sequence**: hosted in
    `apps/registry/` inside the Spicemixer monorepo, deployed alongside
    the website. Cheap, fast.
  - **Step 6 onward** (when pixelmord-hq adopts): promote to standalone
    `@pixelmord/ui-registry` repo. Symmetric with the npm-package
    decoupling (`content-ai-*` packages may also outgrow Spicemixer's
    monorepo eventually — same destination pattern).

Pure presentation helpers without JSX (`summarizeSuggestion`,
`formatConfidence`, `groupSuggestionsByField`) live in
`@pixelmord/content-ai-core` under a `presentation` sub-export. They're
framework-agnostic and small enough to share via the npm package; only
the React/JSX surface goes through the registry.

## Stack constraints

Registry items strictly assume:

- **React 19** (hooks, JSX)
- **Tailwind v4** (utility classes)
- **shadcn-ui (base-ui flavour)** — base-ui is the canonical headless
  primitive layer, not radix-ui. Both consumers use this flavour;
  base-ui is more actively developed.
- **lucide-react** (icons)
- **sonner** (toasts, used sparingly)
- **`cn()` from `@/lib/utils`** (Tailwind class merging — shadcn-ui
  convention)
- **shadcn-ui primitives at `@/components/ui/*`** (Button, Dialog,
  Badge, Popover, Tabs, Input, Textarea, etc.) — consumer has these
  via shadcn CLI before adopting registry items.

What registry items do **not** assume:

- A specific RPC layer (no `astro:actions`, no `convex/_generated`).
  Runner functions are **injected via props** as `onRefine: typeof runRefine`
  / `onFill: typeof runFill`.
- A specific form library. Per-field components receive `currentValue` and
  `onApply` as props (see [Form integration](#form-integration)).
- A specific persistence backend. `AiEventLog` is a typed interface; the
  consumer constructs the adapter (`SidecarEventLog`, `ConvexEventLog`,
  …) and passes it to the hook as a prop.

Registry items import **types only** from `@pixelmord/content-ai-core`
(`AiContract`, `FieldSuggestion`, `AppliedSuggestion`, `TraceSummary`,
`AiEvent`, `EntityRef`, `Origin`, `AiEventLog`, `FieldPath`,
`FieldWritePolicy`). Zero runtime imports from the lifted packages.

## Two-tier API: primitives + blocks

Following shadcn's pattern. **Primitives** are small, unopinionated,
composable. **Blocks** are larger composed templates the consumer pastes
and edits.

### Primitives (contract-agnostic where possible)

| Primitive               | Role                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConfidenceBadge`       | Colored badge: `high` / `medium` / `low`                                                                                                                             |
| `AcceptRejectButtons`   | The check/thumbs-down pair                                                                                                                                           |
| `*SuggestionRow` family | Per-field-type renderers — `TextSuggestionRow`, `TagsSuggestionRow`, `EnumSuggestionRow`, `MultiEnumSuggestionRow`, `DateSuggestionRow`, `ImageGridSuggestionRow`, … |
| `PresetPicker`          | Reads `contract.presets`; renders buttons; emits selected id                                                                                                         |
| `UserPromptField`       | Labeled textarea for free-text amendment                                                                                                                             |
| `DiffPreview`           | Before/after diff for a single field's text value                                                                                                                    |
| `SourcePicker` parts    | `FileInput`, `TextAreaSource`, `PromptInputSource`, `UrlInput`, `TagChipsInput` — primitive pieces for consumers building custom source pickers                      |
| `WritePolicyPicker`     | Radio/select for `preserve` / `replace` / `fill-if-empty` / `merge-…` plus a "Custom…" affordance for per-field overrides                                            |
| `CapabilityLabel`       | Humanized label for in-flight action ("Proposing tags…")                                                                                                             |
| `AutoApplyBadge`        | Small inline badge for auto-applied fields; carries hash + summary + undo affordance                                                                                 |
| `SuggestionTraceInfo`   | Popover content showing `TraceSummary` scalars (model, runtime, preset, userPrompt, confidence, copy-traceId) — opens from an info icon on suggestions and badges    |

### Blocks (contract-aware, composed)

| Block                        | Role                                                                                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiSuggestionsIndicator`     | Small widget: "Get AI suggestions" / "Running…" / "N suggestions across M fields — review in place". Embeddable into a larger content-quality overview. Carries an "Options" affordance opening `SuggestionsOptions`.                                       |
| `SuggestionsOptions`         | Popover content: `PresetPicker` + `UserPromptField` + `WritePolicyPicker` (with sane default preselected). Triggers a run.                                                                                                                                  |
| `InlineFieldSuggestion`      | Per-field component, mounts adjacent to the field's form input. Renders the proposed value via the appropriate `*SuggestionRow` (chosen from the `renderers` prop), shows current value/diff, accept/reject affordances, confidence badge, trace info icon. |
| `IngestDialog`               | Modal: bundled three-tab `FileTextPromptSourcePicker` + `SuggestionsOptions` + post-run inline-suggestion review within the dialog body. Handles both cold-fill (no `currentData`) and merge (with `currentData`).                                          |
| `FileTextPromptSourcePicker` | Reference block: tabbed three-way source input (file / text / prompt). Emits `{ kind: "file"                                                                                                                                                                | "text" | "prompt"; …payload }`via controlled`onChange`. Consumers whose `Source` type matches use it directly; others fork or compose from primitive parts. |

### Per-field-type renderer dispatch

`InlineFieldSuggestion` (and `IngestDialog`'s post-run review body) take
a `renderers` prop dispatching by field kind:

```tsx
<InlineFieldSuggestion
  fieldPath="description"
  currentValue={field.state.value}
  onApply={(v) => field.handleChange(v)}
  renderers={{ ...defaultRenderers, image: ImageGridSuggestionRow }}
/>
```

Registry ships `defaultRenderers` covering text, array, enum,
multi-enum, date. Consumer extends with their own renderer files (each
pasted as a registry item) for custom types (image, color, reference,
…).

Contract-aware components (blocks) are **generic over `AiContract<S, Source>`**
via TypeScript generics; primitives are typed loosely (`unknown`/`string`)
to keep their pasted forms simple. Final generics policy is an open
follow-up (see below).

## The orchestration hook: `useAiSuggestions`

A single hook file (`hooks/use-ai-suggestions.ts`) pasted into the
consumer's repo. Composes hybrid hook + optional context provider for
deep forms.

```ts
function useAiSuggestions<S>(args: {
  contract: AiContract<S>
  currentData: z.infer<S>
  onRefine: typeof runRefine
  onFill?: typeof runFill            // optional
  aiEventLog: AiEventLog             // prop interface; block calls .read/.append
  entityRef: EntityRef               // explicit, not read from ALS
  origin: Origin                     // explicit, not read from ALS
}): {
  // state
  isRunning: boolean
  suggestions: Map<FieldPath<S>, FieldSuggestion<...>>
  autoApplied: Map<FieldPath<S>, AppliedSuggestion>     // until form save
  traces: Map<string, TraceSummary>
  viewedFields: Set<FieldPath<S>>                       // for accept-all gating
  rejectedHidden: number                                // suppression count

  // controlled-with-default options
  preset: string | undefined
  setPreset: (id?: string) => void
  userPrompt: string
  setUserPrompt: (s: string) => void
  writePolicy: FieldWritePolicy | undefined
  setWritePolicy: (p?: FieldWritePolicy) => void

  // actions
  runRefine: () => Promise<void>
  runFill: (sourceContext: any, currentData?: any) => Promise<void>
  acceptAll: () => Promise<{ requiresReview: FieldPath<S>[] } | void>
  dismiss: () => void

  // per-field accessor
  forField: (field: FieldPath<S>) => {
    suggestion: FieldSuggestion<...> | undefined
    autoApplied: AppliedSuggestion | undefined
    trace: TraceSummary | undefined
    recordAccept: (hash: string, value: any) => Promise<void>  // records event; mutation is consumer's responsibility
    recordReject: (hash?: string) => Promise<void>
    revertAutoApply: () => Promise<void>                       // reverts value; records rejected event
    markViewed: () => void                                     // for acceptAll gating
  }
}
```

Co-located optional provider:

```tsx
<SuggestionFlowProvider value={useAiSuggestions(...)}>
  <RecipeForm />
</SuggestionFlowProvider>
```

Children read via `useSuggestionFlowContext()`. The form root sets up the
provider once; nested `InlineFieldSuggestion`s consume via context. Small
forms can skip the provider and pass the hook return down as a prop.

State ownership split:

- **Internal (block-owned)**: `isRunning`, `suggestions`, `autoApplied`,
  `traces`, `viewedFields`, `rejectedHidden`.
- **Controlled-with-default (consumer-overridable)**: `preset`,
  `userPrompt`, `writePolicy`.

## Form integration

`InlineFieldSuggestion` is **form-library-agnostic via per-field controlled
props** — same pattern as `useField()` in form libraries. Each instance
gets its own `currentValue` and `onApply` from the form's field render
context.

```tsx
// tanstack-form example:
<form.Field name="description">
  {(field) => (
    <>
      <Textarea value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue={field.state.value}
        onApply={(v) => field.handleChange(v)}
      />
    </>
  )}
</form.Field>
```

Accept flow:

1. Editor clicks accept on `InlineFieldSuggestion`.
2. Inline calls `onApply(value)` → form library mutates the field.
3. Inline calls `useAiSuggestions().forField(path).recordAccept(hash, value)`
   → hook appends `accepted` event to event log; dismisses suggestion from
   state.

The hook **does not** mutate the form. Form mutation is the consumer's
responsibility through `onApply`. Symmetric with how form libraries
already work; no magic form-state-reading context.

Spicemixer's forms today use bare `useState` — to consume this pattern
cleanly, Spicemixer needs to migrate to `@tanstack/react-form`. Tracked
as open follow-up #7 in the lift plan.

## Runner output coupling

The registry's hook and blocks consume the runner output shape declared
in the lift plan:

```ts
Promise<{
  suggestions: Map<FieldPath, FieldSuggestion>;
  autoApplied: Map<FieldPath, AppliedSuggestion>;
  traces: Map<string, TraceSummary>;
  ingestedEvent?: AiEvent; // only for fill
}>;
```

`FieldSuggestion` is a discriminated union (`single` | `choice`) per the
lift plan revision. `choice`-style suggestions support both single-select
and multi-select via the `choose: 1 | { min, max }` slot. Image-grid,
alternative-phrasing, and multi-pick gallery flows route through `choice`.

## Auto-applied surfacing

The runner pre-mutates `currentData` for auto-applied fields and returns
them in the `autoApplied` map. The UI surfaces this two ways:

1. **`AutoApplyBadge`** inline next to the field. Carries hash + summary
   - revert affordance. Persists until form save (post-save reverts are
     edits, not undos). Revert calls `revertAutoApply()` which restores the
     pre-apply value and emits a `rejected` event for the hash.
2. **Counter** on `AiSuggestionsIndicator`: "3 auto-applied · 5 to
   review."

Single per-field locatable signal + global tally. No toasts (ephemeral),
no per-field toasts (noise tax).

## Write policy in the UI

`WritePolicyPicker` exposes the write-policy choice as a discreet option
in `SuggestionsOptions` (in both `AiSuggestionsIndicator` and
`IngestDialog`). Sane default preselected per mode:

- Refine: `replace` (default)
- Fill cold: irrelevant
- Fill with `currentData` (merge): `fill-if-empty` (conservative)

UI surfaces:

```
How should I handle existing fields?
( ) Replace everything
(•) Fill gaps only
( ) Merge intelligently (per-field defaults)
( ) Custom…     [opens per-field policy panel]
```

"Merge intelligently" uses each field's `writePolicy` baseline from the
contract. "Custom…" exposes per-field overrides via
`runFill.fieldPolicies`. Refine flow doesn't surface this prominently
(refine review is per-field anyway); fill flow does.

## Trace surfacing

`SuggestionTraceInfo` opens from an info icon on suggestions and badges.
Shows `TraceSummary` scalars only — model, runtimeMs, preset, userPrompt,
confidence, copy-traceId. **Omits** token counts, cost, system prompt,
response body (developer-grade or ADR 0011 payload boundary).

## v1 inventory

Primitives (12):

- `ConfidenceBadge`
- `AcceptRejectButtons`
- `TextSuggestionRow`
- `TagsSuggestionRow`
- `EnumSuggestionRow`
- `MultiEnumSuggestionRow`
- `DateSuggestionRow`
- `PresetPicker`
- `UserPromptField`
- `DiffPreview`
- `WritePolicyPicker`
- `CapabilityLabel`
- `AutoApplyBadge`
- `SuggestionTraceInfo`
- Source-picker primitive parts: `FileInput`, `TextAreaSource`,
  `PromptInputSource`, `UrlInput`, `TagChipsInput`

Blocks (5):

- `AiSuggestionsIndicator`
- `SuggestionsOptions`
- `InlineFieldSuggestion`
- `IngestDialog`
- `FileTextPromptSourcePicker`

Hooks (1):

- `useAiSuggestions` + co-located `SuggestionFlowProvider` /
  `useSuggestionFlowContext`

Total: ~20 registry items.

Deferred from v1:

- `ImageGridSuggestionRow` (and image-handling primitives) — wait for
  first real image-field contract to drive the design.
- `TranslateDialog` — translate is a preset (per the lift plan);
  consumer wraps `IngestDialog` or `AiSuggestionsIndicator` with the
  preset preselected. If the pattern repeats across consumers, promote
  to a registry item.
- `AiCallInspector` (full trace browser) — defer until two consumers
  ask for it.
- `WholeEntitySummaryView` (bird's-eye "this is what AI proposed for the
  whole entity") — defer unless cold-fill UX demands it.

## Open follow-ups

These are deferred decisions surfaced during grilling but not blocking
the v1 inventory:

1. **Translation block surface.** Whether translate gets a thin
   `TranslateDialog` block (preset preselected, target-language picker
   surfaced) or stays composable from `IngestDialog` + preset. Decide
   when first translate flow lands in a consumer.
2. **TypeScript generics policy in pasted components.** Full
   `<S extends ZodSchema>` generics on `InlineFieldSuggestion` and other
   contract-aware blocks vs. loose `unknown`/`string` at boundaries. Full
   generics give typesafety but pasted-into-your-repo generic components
   are unusual and may scare consumers. Decide when writing the first
   block.
3. **Storybook / demo strategy.** How registry items are demonstrated
   and learned. Options: Storybook in `apps/registry/`, a static demo
   site, MDX in the registry repo, or just README snippets. No decision
   yet.
4. **Spicemixer migration sequence.** How current `AiAssistPanel`,
   `EnhanceModal`, `TranslateModal`, `InlineSuggestion`,
   `CompletenessPanel` migrate to the new registry-based shape. Likely
   parallel to the lift plan's step 3 (carve out refine). Worth its own
   focused grilling session before execution.
5. **`SuggestionsIndicator` vs `CompletenessPanel` integration in
   Spicemixer.** The indicator is a registry block; the completeness
   panel is Spicemixer-side (completeness is schema-/domain-specific).
   Composition pattern to be drafted during migration.
6. **Apply-all viewed-fields rule UX.** The hook tracks `viewedFields`
   and `acceptAll` surfaces a `requiresReview` result. How blocks render
   the "you haven't seen all of these yet" warning — inline notice,
   modal confirm, button-disable — is a small block-level decision.
   Default: inline notice with a "Review remaining first" CTA.

## Migration sequence (rough)

Maps onto the lift plan's migration sequence. Not committed; this is
one viable order.

1. **Land lift plan steps 1-3 first.** Carve `content-ai-core` and
   `content-ai-refine`; rewrite Spicemixer proposers as field configs.
   Until contracts exist as values, the registry can't be built against
   them.
2. **Stand up `apps/registry/`** in the Spicemixer monorepo. Empty
   skeleton with `registry.json` and the shadcn-CLI plumbing. Deploy
   alongside the website (cheap, just static JSON files).
3. **Write primitives first.** `ConfidenceBadge`, `AcceptRejectButtons`,
   `*SuggestionRow` family. Test in Spicemixer admin (paste them into
   `apps/website/src/components/admin/` via the registry CLI).
4. **Write `useAiSuggestions` hook.** Validate against Spicemixer's
   `RecipeForm` flow rewritten on top of it.
5. **Write `InlineFieldSuggestion` block** and migrate `RecipeForm` from
   the current `AiAssistPanel` sidebar to inline per-field. Requires
   form migration to `@tanstack/react-form` (lift-plan open follow-up
   #7) as prerequisite.
6. **Write `AiSuggestionsIndicator` + `SuggestionsOptions`.** Hook into
   Spicemixer's `CompletenessPanel` composition.
7. **Write `IngestDialog` + `FileTextPromptSourcePicker`.** Migrate
   Spicemixer's `EnhanceModal` flow onto it.
8. **Lift plan step 6**: pixelmord-hq adopts content-ai packages.
   Parallel: pixelmord-hq adopts registry items (paste into its
   `packages/ui/`). Validates the registry seam against the second
   consumer.
9. **Promote registry to standalone repo** once pixelmord-hq is
   consuming it. Same logic as the lift plan's package decoupling.

## When to ADR this

Once step 2 is committed (registry skeleton exists), an ADR is
warranted. Probably **ADR 0017 "UI for AI suggestions is a shadcn-style
registry, not an npm package"** — sibling to the lift plan's ADR 0016.
(ADR 0014 and 0015 were claimed by the 2026-05-16 translation-flow
work; this ADR slots after that.)

The three ADR criteria:

- **Hard to reverse** — once consumers have pasted dozens of registry
  items into their repos, changing distribution shape (e.g. moving to
  npm package, or restructuring the registry schema) breaks all of
  them simultaneously.
- **Surprising without context** — future archaeology will ask "why
  isn't there an `@pixelmord/content-ai-ui` package?" Answer: "shadcn
  philosophy — UI is the part you most need to own and modify; the
  registry is a deliberate non-package."
- **Real trade-off** — alternative was an npm-shipped headless or
  styled package. Chose registry-of-paste-able-source because it
  matches the editor of UI components people want to forkable, not
  versioned dependencies.

## Cross-references

- `docs/plans/2026-05-15-content-ai-package-lift.md` — sibling plan;
  the npm-package layer this registry sits on top of. The registry
  imports types from `@pixelmord/content-ai-core`.
- `docs/research/2026-05-15-content-ai-ui-registry.md` — the
  brainstorming for this plan. Walks the 13 design branches and the
  reasoning behind each decision.
- ADR 0004 — AI auto-apply boundary; informs `AutoApplyBadge` revert
  behavior + event log shape.
- ADR 0008 — EntityKind seam this builds on (contracts are kind-keyed).
- ADR 0011 — AI observability; informs `SuggestionTraceInfo`'s
  scalar-only display and "no payloads in editor-facing UI" rule.
- ADR 0013 — meta sidecar carries workflow state; event log payload
  site, written through the `AiEventLog` adapter prop.
- shadcn-ui registry docs — for the JSON schema and CLI integration
  patterns the registry follows.
