# UI registry for content-ai suggestions — 2026-05-15

Grilling session via `/grill-with-docs`. Walks thirteen design branches to
decide how to ship the UI substrate on top of the
`@pixelmord/content-ai-{core,ingest,refine}` packages from the sibling
package-lift session.

The execution-shaped output lives at
`/docs/plans/2026-05-15-content-ai-ui-registry.md`. This doc captures the
**brainstorming** — what was considered at each branch, why we rejected
alternatives, where the design pressures came from. Use it if the plan
needs relitigation or if a question reopens.

## Frame

Continuing from the package-lift grilling
(`/docs/research/2026-05-15-content-ai-package-lift.md`) which decided the
three-package layer. User raised a sibling concern: consumers also need
**UI components** to interface with AI suggestions, and the requirements
look similar across consumers (present suggestion, apply/reject,
multi-field overview, preset application, user prompt modal). User
proposed sharing UI as a package.

Initial assumption to interrogate: is "package" even the right shape for
UI substrate, given that consumers may have different stacks or want to
adjust the implementation?

## Cross-project context gathered

Spicemixer existing AI-suggestion UI surface (~2,000 lines):

- `AiAssistPanel.tsx` (913 lines) — sidebar panel hardcoding 5 ops
  (`links`, `tags`, `improve`, `translate`, `pairings`) × 2 kinds
  (`recipe`, `ingredient`). The lift dissolved both axes; this component
  is structurally obsolete.
- `EnhanceModal.tsx` (280 lines) — modal with source picker (file / text
  / prompt) and diff preview; calls `aiMerge*` actions (merge: source +
  existing data).
- `TranslateModal.tsx` (265 lines) — translate-specific modal.
- `CompletenessPanel.tsx` (233 lines) — required/recommended field
  status overview.
- `InlineSuggestion.tsx` (99 lines) — per-field inline suggestion (used
  in limited contexts).
- `DiffPreviewModal.tsx` (93 lines) — modal diff display.
- `*Diff.tsx` family (4 files) — per-kind diff components.

Stack: React 19, Tailwind v4, shadcn-ui (base-ui flavour, not radix-ui),
lucide-react icons, sonner toasts, `cn()` utility, `astro:actions` for
RPC. Forms use bare `useState`.

pixelmord-hq: out of my read scope at the time of grilling, but per
research from the prior session: no AI event log, no trace, no Origin
envelope, no surfaced AI suggestion UI. Backend curation actions exist
(`categorizePost`, `deriveEntityFromPost`, `refreshDerivedEntityFromPost`,
`suggestRelations`). User confirmed stack overlap (Tailwind, shadcn-ui
base-ui flavour). pixelmord-hq has a `packages/ui/` shared UI library
consumed by multiple apps; that package is the paste target for
registry items (not the apps directly).

Asymmetry recognised early: Spicemixer has the mature UI; pixelmord-hq
has almost none today. The "both consumers need it" framing was more
accurately "Spicemixer has it; pixelmord-hq will need to build it." This
shaped Q1's grilling.

## The branches walked

### Q1 — Is the lift an npm package at all, or a shadcn-style registry?

User's framing — "exemplary implementation consumers can modify for their
stack or adjust to their needs" — was the shadcn thesis verbatim. shadcn
deliberately rejected npm-packaged components after watching MUI/Chakra
users get stuck behind opinionated APIs.

Options offered:

- (a) shadcn-style registry (paste source code into the consumer's repo)
- (b) Headless npm package (Radix/Headless-UI shape; hooks + ARIA, no
  styling)
- (c) Styled npm package (shadcn-flavored MUI; ready-to-render with
  Tailwind classes baked in)

Recommended (a). Discussed:

- (c) is the most tempting and the most dangerous. Spicemixer and
  pixelmord-hq sharing today doesn't mean they share in 18 months. Once
  the styled package exists, any third consumer with a different design
  system has to choose between "fork the package" or "use it ugly."
- (b) is the middle path that rarely pays off — headless libraries
  either grow into full styling needs (Radix → shadcn) or stay so
  abstract that consumers reimplement the wrapper layer anyway.
- (a) matches the user's own framing exactly, and the lift plan's
  package layer is the right home for the type/logic substrate
  (`AiContract`, `FieldSuggestion`, `Origin`, `AiEventLog`). UI is the
  renderer; pasted source is the right shape.

User added the caveat: pure non-JSX helpers (`summarizeSuggestion`,
`formatConfidence`, `groupSuggestionsByField`) should live in
`content-ai-core`. They're framework-agnostic, small, and shareable as
package code.

**Decision: (a) shadcn-style registry; presentation helpers in
`content-ai-core`.**

### Q2 — What does the registry assume about the consumer's stack?

Three positions:

- (a) Strict: React + Tailwind + shadcn-ui + lucide + sonner required;
  RPC injected via callbacks
- (b) Lax: React + Tailwind only; consumer brings their own
  dialog/button/badge primitives
- (c) Stack-targeted variants: ship `react-tailwind-shadcn` today, leave
  room for `vue-tailwind-headless` later

Recommended (a). Discussed:

- (b) sounds nicer but creates more friction — "you can use it without
  shadcn-ui" means writing components that don't presume Dialog/Button
  shapes, which means re-inventing them poorly.
- (c) is the future-proofing trap.
- (a) is honest about what two real consumers share.

User added a critical sharpening: shadcn-ui ships in two flavours
(radix-ui-backed and base-ui-backed). **Both consumers use base-ui**, and
base-ui is more actively developed. Constraint: registry assumes
base-ui flavour, not radix.

The deeper commitment: RPC must be injected via props (not imported in
registry items). No `astro:actions` import inside the registry, ever.
Runner functions arrive as `onRefine: typeof runRefine`.

Also accepted: registry components are **generic over `AiContract<S, Source>`**
— pasted-into-your-repo TypeScript components with generics. Doable but
unusual.

**Decision: (a), with base-ui as canonical headless layer; RPC injected;
contract-generic components.**

### Q3 — One composed block, primitives, or both?

Spicemixer's current `AiAssistPanel` is one god component (913 lines)
because it hardcodes ops × kinds into one switch-laden block. The lift
dissolves both axes. Question: what shape replaces it?

Options offered:

- (a) One contract-driven block (`<RefinePanel contract={...}/>`)
- (b) Small composable primitives only
- (c) Both — primitives + blocks (shadcn's actual pattern)

Recommended (c). Discussed:

- (a) alone repeats the god-component mistake. The lift dissolves
  kind-dispatch into contracts but a single `<RefinePanel>` still
  hardcodes layout (inline vs modal). Spicemixer already has both
  inline (`AiAssistPanel`) and modal (`EnhanceModal`) shapes — no
  single block fits both.
- (b) alone pushes too much assembly onto the consumer.
- (c) ships primitives for composition AND example blocks as templates.
  Consumer picks the level.

Important constraint: **only blocks are contract-generic; primitives
are contract-agnostic**. This keeps primitives reusable in non-AI
contexts (admin diff UIs) and avoids leaking `AiContract` typing into
every leaf.

Drafted primitive list: `ConfidenceBadge`, `AcceptRejectButtons`,
`SuggestionRow`, `MultiFieldSuggestionList`, `PresetPicker`,
`UserPromptField`, `DiffPreview`, `SourcePicker`, `CapabilityLabel`.

Drafted block list: `RefinePanel`, `EnhanceDialog`, `InlineFieldSuggestion`,
`TranslateDialog`, `CompletenessPanel`.

User noted gaps: different field types need different `SuggestionRow`
shapes — text, tag array, enum, multi-enum, date, image-grid. Image
specifically breaks the data model (N candidates the user picks among,
not one value).

**Decision: (c) primitives + blocks; per-field-type renderer family.**

### Q4 — Renderer dispatch and the multi-candidate data shape

Two coupled sub-questions surfaced.

**4a — How are per-type renderers organised?**

- (a) Hardcoded switch in the block (`switch(fieldKind) { ... }`)
- (b) `renderers` prop on the block (`<RefinePanel renderers={{...}}/>`)
- (c) Field config declares renderer by name

Recommended (b). Discussed:

- (a) creates fork pain when a consumer wants a custom image renderer.
- (c) couples the contract to renderer identity — contract should
  describe _what the field is_, not _how to render it_.
- (b) keeps the contract clean; defaults provided, consumer merges in
  extensions. Same pattern as react-hook-form's `Controller render`,
  keyed.

The renderer components themselves stay pasted-source registry items.
Adding a new renderer in your repo = paste a new file + register it
locally.

**4b — The image case exposed a data-shape gap.**

The current `FieldSuggestion<T>` has `value: T`. But "suggest 4 images,
pick one" is N candidates → user picks. Same pattern for "suggest 3
alternative phrasings."

Options:

- (i) Multi-candidate is N parallel suggestions
  (`Map<FieldPath, FieldSuggestion[]>`)
- (ii) Discriminated union: `{ kind: "single"; value: T } | { kind: "choice"; candidates: T[] }`
- (iii) Never multi-candidate; UI does sequential review

Recommended (ii). Discussed:

- (iii) breaks the side-by-side comparison UX (the whole point of
  multi-candidate).
- (i) leaks the multi/single distinction into the container — every
  call site has to handle both.
- (ii) keeps the suggestion-per-field invariant; variance lives inside
  the suggestion record where the renderer dispatch can pick it up.
- (ii) maps cleanly onto the event log: `choice` acceptance emits
  `accepted` for the chosen hash; explicit rejections emit `rejected`
  for the others. No new event kind.

User added: multi-select must be supported too (gallery picks 2 of 4
images). Choice slot becomes `choose: 1 | { min: number; max: number }`.

This was the first revision to the lift plan triggered by the UI
grilling. Updated `FieldSuggestion<T>` shape in the plan.

**Decision: (b) renderers prop; (ii) discriminated FieldSuggestion;
both single and multi-select.**

### Q5 — Registry hosting and distribution

Four shapes:

- (a) Subdirectory in Spicemixer monorepo (`apps/registry/`)
- (b) Standalone `@pixelmord/ui-registry` repo
- (c) Vendored inside `packages/content-ai-core`
- (d) No shared registry — each consumer copies independently

Recommended (b) with (a) as transitional. Discussed:

- (d) defeats the point of a shared substrate.
- (c) couples npm releases to registry content — friction the shadcn
  philosophy explicitly rejects.
- (a) smells like the "one project owns the shared thing" trap from
  Q1 of the lift session.
- (b) treats the registry as a peer to the npm packages —
  `content-ai-*` is type/logic substrate; `ui-registry` is UI
  substrate. Symmetric.

User accepted (b) destination + (a) transitional. Added note: the
`content-ai-*` packages will also eventually need to decouple from
Spicemixer's monorepo — same pattern, park for later.

Naming: user picked `@pixelmord/ui-registry` over `@pixelmord/registry`
(too broad) or `pixelmord-content-ai-registry` (too narrow). Generic
enough to host non-AI UI later; not so generic as to suggest "all of
Pixelmord's UI."

User clarified shadcn setup state: both consumers use shadcn CLI via
`components.json`. **Spicemixer's paste target is `apps/website/`.
pixelmord-hq's paste target is `packages/ui/`** (a shared internal UI
library consumed by multiple apps). Important constraint: registry
items must work in either destination, meaning no consumer-specific
import alias beyond what `components.json` resolves.

**Decision: (b) destination, (a) transitional;
`@pixelmord/ui-registry`; registry items free of consumer-specific
imports.**

### Q6 — State ownership in blocks + callback contract shape

Two coupled questions.

**6a — Who owns the block's internal state?**

- (a) Block-owned (uncontrolled)
- (b) Consumer-owned (fully controlled)
- (c) Hybrid (controlled-with-default for input state; internal for
  output state)

Recommended (c). Discussed:

- (a) immediately bites when the consumer wants programmatic control
  (open with preset preset; reset on save; persist user prompt across
  reloads).
- (b) is over-controlled — first consumer experience is "why do I have
  to wire 6 useState hooks?"
- (c) matches shadcn's house style: controlled props are optional;
  defaults make the simple case ergonomic. `preset` and `userPrompt`
  are controlled-with-default; `loading` and `result` are internal.

**6b — Callback contract shape**

- (i) Exact runner signature mirror (`onRefine: typeof runRefine`)
- (ii) Wrapper-shaped callbacks (parallel type vocabulary)
- (iii) Inject the package object directly

Recommended (i). Discussed:

- (ii) is the abstraction-tax trap — parallel types that do the same
  job, with hollow benefit.
- (iii) couples the block to runtime imports from the packages, which
  violates the registry's portability promise.
- (i) keeps the block's runtime imports to **types only** from
  `content-ai-core`. Consumer wires actual runners as props
  (`<RefinePanel onRefine={runRefine} ... />`). Zero abstraction tax.

Coupled question: how does the block access `AiEventLog`?

- As a prop interface (block calls `.append()` directly)
- As event callbacks (`onRecordEvent`)

Picked prop interface — same pattern as `onRefine`. Consumer
constructs the adapter (`SidecarEventLog` or `ConvexEventLog`) and
passes it in.

**Decision: (c) hybrid state; (i) exact runner mirror with types-only
imports; `AiEventLog` as prop interface.**

### Q7 — Output-shape asymmetry and the third capability

This was the first major revision to the lift plan triggered by the UI
grilling. The plan declared two runner output shapes:

- `runRefine` → `Map<FieldPath, FieldSuggestion>`
- `runFill` → `{ data: Partial<entity>, ingestedEvent }`

Looking at Spicemixer's actual code surfaced a third pattern: `aiMerge*`
takes **both** existing data and source. Merge: warm-fill,
source-into-existing. The plan implicitly mapped `extract-*` to fill and
`curate-*` to refine, but `merge-*` had no explicit home.

**7a — Where does merge live?**

- (a) Fold merge into fill (add `currentData?` to `runFill`)
- (b) Third capability with its own package
- (c) Add `sourceContext?` to `runRefine`

Recommended (a). The seam between fill and refine is the **presence of
source**, not the presence of `currentData`. Merge is sourced → fill.

**7b — Unify output shapes?**

- (i) Both runners return `Map<FieldPath, FieldSuggestion>`
- (ii) Keep them split

Recommended (i). The UX of "AI extracted a recipe — review each field
before saving" is functionally identical to "AI proposed updates — review
each." Output shape doesn't have to differ. `ingestedEvent` ships
alongside the map as a sibling concern.

User accepted both, with additional framing that turned out to be
load-bearing: "fill ... should adhere to the same rules and system
prompts on a per field basis ... one can set 'rules' for a field so it
will either not overwritten by a fill or a suggestion or it can be
completely overwritten or the data could be 'combined' or merged."

This surfaced a new concept the lift plan didn't have — per-field write
policy. Captured in Q8.

**Decision: (a) fold merge into fill; (i) unify output shapes; new
concept `FieldWritePolicy` enters the plan.**

### Q8 — Where does "how does a field interact with existing data" live?

Three positions:

- (a) Natural-language instruction in the system prompt (soft, LLM
  compliance-dependent)
- (b) Structured `writePolicy` on `FieldConfig` (hard, code-enforced)
- (c) Both — structured policy as source of truth, prompt builder
  derives instruction from it

Recommended (c). Same pattern as `AutoApplyPolicy` (structured field

- prompt awareness). One source of truth, two consumers.

**Shape — three flavors of expressiveness:**

- (i) Minimal string enum (`preserve` / `replace` / `fill-if-empty`)
- (ii) Enum + custom merger escape hatch
  (`{ mode: "merge"; merge: (current, proposed) => merged }`)
- (iii) Full type-aware (with `append`, `union`, etc.)

Recommended (ii). User pushed back on the merge shape with two
sharp objections:

1. **A code-function merge doesn't fit text.** For prose, "merging"
   is an LLM task, not a code task. Need a prompt-instruction
   variant.
2. **Per-field static policy is too rigid.** Editor wants to choose
   policy at fill-time depending on what they're putting in.

This led to two revisions:

- The merge mode bifurcates into **`merge-function`** (code does the
  merge, for structural data) and **`merge-instructions`** (LLM does
  the merge per a free-text instruction, for prose). User picked the
  names — they signal what's in the slot.
- `writePolicy` gains a **layered override**: per-call per-field
  override → call-level default → contract per-field default → mode
  default. Editor chooses via UI policy picker.

Naming check: `writePolicy` accepted (applies to both fill-with-currentData
and refine).

UI implication: new primitive `WritePolicyPicker`. Block surface in
`IngestDialog` — gets a prominent policy choice above source picker.

**Decision: (c) structured `writePolicy`; (ii) string enum + `merge-function` +
`merge-instructions`; layered override; new `WritePolicyPicker` primitive.**

Plan + CONTEXT.md updated with `FieldWritePolicy` term.

### Q9 — Is the orchestration hook the right substrate?

The pivot to "indicator + per-field inline" (anticipated to happen in
Q10's reframing) pushed orchestration from a _component_ to a _hook_.
Four sub-questions:

**9a — Hook vs context vs both**

- (a) Plain hook called at form root
- (b) Hook + React context
- (c) Hybrid — same hook return, provider optional

Recommended (c). Small forms use hook directly; deep forms use
provider. Matches shadcn's `<Form>` + `useForm` pattern.

**9b — One hook file or composed hooks?**

- (a) Single hook file
- (b) Composed smaller hooks

Recommended (a) for v1. If a consumer needs to fork a subset later,
they can split it themselves.

**9c — `entityRef` and `origin` — required props or read from ALS?**

- (a) Required props
- (b) Hook reads `originContext.getStore()` internally

Recommended (a). The hook uses runners (which themselves use ALS), but
the hook doesn't peek into ALS itself. Keeps the hook testable and
ALS-agnostic.

**9d — Name**

Picked `useAiSuggestions` over `useSuggestionFlow`, `useAiContractFlow`,
`useFieldSuggestions`. Short, names the domain, names the verb, no
awkward `Flow` suffix.

User confirmed all four picks with an important reframing that
restructured the block tier:

> The sidebar component does a good job of showing the current "state"
> of the content quality: indicates which fields are required and which
> are recommended and if it shows that suggestions exist for a number
> of those fields ... that is also good information that belongs in
> that content quality overview. but the actual suggestions need to be
> located with the field.

This dissolved `RefinePanel` as a sidebar surface entirely. The panel
becomes a _content quality overview_ (Spicemixer-side composition);
the registry ships `AiSuggestionsIndicator` (a small embeddable block)
and per-field `InlineFieldSuggestion`. Suggestions are reviewed where
the field is rendered — context preserved.

User also raised: **"apply all" needs a guard** — editor must have
seen each suggestion at least once before bulk-applying. Hook tracks
`viewedFields: Set<FieldPath>`; `acceptAll` surfaces `requiresReview`.

**Decision: (c) hybrid hook+provider; (a) one hook file;
(a) explicit `entityRef`/`origin` props; `useAiSuggestions`; sidebar
reframed as content quality overview, not suggestion review surface.**

### Q10 — Form integration

`InlineFieldSuggestion` needs to read the field's current value and
trigger apply on accept. Four shapes:

- (a) Form-agnostic via controlled props (each inline gets its own
  `currentValue`, `onAccept`)
- (b) Form-library binding via known adapters (`react-hook-form`,
  `tanstack/react-form`, …)
- (c) Form-agnostic context (`FormStateProvider` with global
  `getValue`/`setValue`)
- (d) Registry imposes a specific form library

Initially recommended (c) — one adapter point per form, not per field.

User pushed back: **(a) is right, with the form-library `useField`-style
idiom as the reference**:

> How about just passing the setter function to the field's refine
> component directly? then we can prescribe the interface for a field
> mutation and the implementing consumer can decide how they implement
> the mutation. It might be a bit repetitive, but it is similar to how
> form libraries handle custom fields with e.g useField().

The user was right. tanstack-form's `<form.Field>` and react-hook-form's
`<Controller>` already expose per-field setters; the inline component
should follow the same idiom, not invent a separate one. The repetition
is acceptable because it matches what the consumer's form layer
already does.

This also adjusted the accept flow:

- Inline owns the apply via `onApply(value)` prop.
- Hook records the event via `forField(path).recordAccept(hash, value)`.
- Hook does **not** mutate the form. Mutation is the consumer's
  responsibility via `onApply`.

User added a roadmap item: **Spicemixer needs to migrate forms from bare
`useState` to `@tanstack/react-form`** before consuming the inline
pattern cleanly. Recorded as lift-plan open follow-up #7.

**Decision: (a) form-agnostic per-field controlled props; hook owns
events, inline owns mutation; Spicemixer forms migration logged.**

### Q11 — Auto-applied surfacing

Trust problem: the runner can auto-apply high-confidence suggestions
silently. Without surfacing, editor will be confused about who filled
which field.

Four shapes:

- (a) Silent counter in the indicator only
- (b) Inline "AI auto-applied this" badges with undo
- (c) Toast notification
- (d) All three

Recommended (b) + (a). Discussed:

- (a) alone leaves the editor blind to _which_ fields changed.
- (c) alone is ephemeral; if editor was looking elsewhere when toast
  fired, info is gone.
- (d) is noise tax — same event signaled three times.
- (b) gives a persistent, locatable signal next to the field with
  revert ergonomics. (a) gives the global tally.

New primitive: `AutoApplyBadge`. New hook state:
`autoAppliedFields: Map<FieldPath, AppliedSuggestion>`.

Runner return shape revision: sibling map vs embedded flag.

- (i) Sibling — `{ suggestions, autoApplied }`
- (ii) Embedded `autoApplied` flag inside `FieldSuggestion`

Recommended (i). Auto-applied are not pending review; different
lifecycle. Keeping them separate clarifies "what does the editor still
need to look at."

Undo timing: until form save. Post-save reverts are edits, not undos.
Cleanest mental model.

**Decision: (b) badges + (a) counter; (i) `{ suggestions, autoApplied }`
sibling return; undo until form save.**

Plan updated with `AppliedSuggestion` type + autoApplied return shape.

### Q12 — Source picker primitive

Source pickers are per-contract — `Source` is a contract type parameter.
The registry can't ship one universal `<SourcePicker>`.

Three shapes:

- (a) Generic headless `useSourcePicker` hook only
- (b) Opinionated reference blocks (Spicemixer's three-tab pattern + a
  pixelmord-flavor block)
- (c) Primitive parts only (`FileInput`, `TextAreaSource`, …)

Recommended (b)+(c) combined. Reference blocks for common shapes;
primitive parts for custom assembly.

Source picker emits its `Source` value via `onChange` (controlled —
parent block coordinates source + policy + preset + user prompt).
Self-contained `onSubmit` pickers were rejected — the "Generate"
button lives at the dialog level.

Whether to bundle the three tabs (file / text / prompt) or split into
three blocks: user picked **bundle into one**, with the YAGNI principle
to split later when there's a reason.

**Decision: (b)+(c) combined; controlled `onChange`; bundled
three-tab block.**

### Q13 — AI Trace surface in UI

Lift plan + ADR 0011 establish AI Trace as ops-grade observability. Does
the _editor_ see this?

Three positions:

- (a) Trace stays invisible to editors
- (b) Unobtrusive "i" affordance per suggestion (popover with scalars)
- (c) Full trace browser block

Recommended (b). Discussed:

- (a) leaves the editor as bug reporter with no concrete artifact to
  relay.
- (c) is over-built for v1 — defer until two consumers ask.
- (b) is the right floor: small, persistent, scalar-only.

Popover content (decided): model, runtimeMs, preset, userPrompt,
confidence, copy-traceId. **Omits**: token counts, cost, system prompt
body, response body. The first two are developer-grade; the last two
are payload-boundary per ADR 0011.

Sibling map vs embedded: picked sibling. Multiple suggestions can share
one trace (one LLM call returns N fields); dedup keeps suggestions
slim.

New primitive: `SuggestionTraceInfo`. New hook state: `traces` map.
Runner return shape gains `traces: Map<traceId, TraceSummary>` sibling.

**Decision: (b) info popover; omit tokens/cost; sibling traces map.**

Plan updated with `TraceSummary` type + traces return shape.

## Conventions established during grilling

- **Registry distribution is shadcn-style, not npm.** Pasted source the
  consumer owns and edits.
- **base-ui is the canonical headless layer** (not radix-ui). Both
  consumers' shadcn-ui flavour.
- **Registry items import types only from `content-ai-core`.** Runtime
  imports stay out. RPC, persistence, ALS all come in via props.
- **Two tiers — primitives (contract-agnostic) and blocks
  (contract-generic).** Only blocks reference `AiContract<S, Source>`
  in their typings.
- **Per-field-type renderer dispatch via `renderers` prop on blocks.**
  Built-in defaults; consumer extends.
- **`FieldSuggestion<T>` is a discriminated union** of `single` and
  `choice`. `choice` supports single- and multi-select via `choose: 1 | { min, max }`.
- **Output shapes unified across runners.** Both return
  `Map<FieldPath, FieldSuggestion>` + `autoApplied` + `traces`; fill
  adds `ingestedEvent`.
- **`FieldWritePolicy` is a new first-class concept** on `FieldConfig`.
  Five modes including `merge-function` (code) and `merge-instructions`
  (LLM). Layered override at fill time.
- **Sidebar is reframed as content quality overview, not suggestion
  review.** Suggestions live inline next to fields.
- **Inline-suggestion form integration follows form-library `useField`
  idiom.** Per-field controlled props; hook records events, inline
  mutates form.
- **Auto-applied surfaces via inline badge + counter, not toast.**
  Undo until form save.
- **Trace surfaces as a per-suggestion info popover with scalars only.**
  No payloads, no tokens, no cost in editor-facing UI.

## Implications

Lifted into the execution plan
(`/docs/plans/2026-05-15-content-ai-ui-registry.md`):

- v1 inventory of ~20 registry items (primitives + blocks + hook).
- `useAiSuggestions` hook signature.
- Form integration pattern.
- Migration sequence keyed to the lift plan's migration sequence.
- Open follow-ups for translate-block surface, generics policy,
  Storybook/demo strategy, Spicemixer migration sequence,
  Indicator+Completeness composition, apply-all UX.
- ADR 0015 to be written when the registry skeleton is committed.

Triggered revisions in sibling docs:

- `docs/plans/2026-05-15-content-ai-package-lift.md`:
  - `FieldSuggestion<T>` revised to discriminated union (Q4b).
  - `runFill` signature gains `currentData`, `writePolicy`,
    `fieldPolicies` params (Q7a, Q8).
  - Both runner output shapes unified, both gain `autoApplied` map and
    `traces` map (Q7b, Q11, Q13).
  - `FieldWritePolicy` type added (Q8).
  - `FieldConfig` gains optional `writePolicy` slot (Q8).
  - Open follow-up #7 added: Spicemixer forms migration to
    `@tanstack/react-form` (Q10).
- `CONTEXT.md`:
  - AI contract entry updated: stale modes language removed; `writePolicy`
    mentioned.
  - New glossary entry: `FieldWritePolicy`.

## Open follow-ups deferred

Surfaced during grilling, not resolved:

1. **Translation block surface.** Thin `TranslateDialog` vs.
   `IngestDialog` with preset preselected. Decide when first translate
   flow lands in a consumer.
2. **TypeScript generics policy in pasted blocks.** Full `<S>` generics
   vs loose typing. Decide when writing the first contract-aware block.
3. **Storybook / demo strategy.** How registry items are demonstrated
   and learned. No decision yet.
4. **Spicemixer migration sequence.** Detailed plan for migrating
   `AiAssistPanel`, `EnhanceModal`, `TranslateModal`, `InlineSuggestion`,
   `CompletenessPanel`. Likely its own grilling session.
5. **`AiSuggestionsIndicator` ↔ `CompletenessPanel` composition.**
   Spicemixer-side integration pattern.
6. **Apply-all viewed-fields rule UX.** How blocks surface the "review
   first" warning when `acceptAll` returns `requiresReview`. Default:
   inline notice with CTA.

## When to revisit

- After lift plan step 3 (carve out refine) is committed — the registry
  needs `AiContract` values to build against.
- When pixelmord-hq adopts its first registry item — validates the
  seam against the second consumer; may surface fork-vs-update tensions.
- When a third consumer with a different design system appears —
  re-test the base-ui assumption.
- If `suggestRelations`-style retrieval becomes a third concrete
  capability across two consumers, the registry will need a `relations`
  block family (mirrors the lift plan's "promote to content-ai-relate"
  trigger).

## Reference

- Sibling plan: `/docs/plans/2026-05-15-content-ai-package-lift.md`
  (the npm-package layer this registry sits on).
- Sibling research:
  `/docs/research/2026-05-15-content-ai-package-lift.md` (the prior
  grilling session that established the package layer).
- Sibling plan: `/docs/plans/2026-05-15-content-ai-ui-registry.md`
  (the execution-shaped output of this session).
- ADRs cross-referenced during grilling: 0004 (auto-apply boundary +
  event log shape), 0008 (EntityKind seam this builds on),
  0011 (AI observability — informs the trace-popover scalar boundary),
  0013 (meta sidecar workflow state).
- Existing Spicemixer UI surface referenced:
  `apps/website/src/components/admin/AiAssistPanel.tsx`,
  `EnhanceModal.tsx`, `TranslateModal.tsx`,
  `CompletenessPanel.tsx`, `InlineSuggestion.tsx`.
- shadcn-ui registry docs (referenced for the JSON schema and CLI
  integration patterns).
