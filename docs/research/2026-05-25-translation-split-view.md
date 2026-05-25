# Translation split view as the editing surface — 2026-05-25

Grilling session via `/grill-with-docs`. Walks thirteen design questions
to reshape the translation editing surface in light of how ADR 0015's
two-phase model landed in practice across three forms.

The execution-shaped output lives at
`/docs/plans/2026-05-25-translation-split-view.md`. The architectural
decisions land as an amendment block on ADR 0015. This doc captures
the **brainstorming** — what was considered at each branch, why we
rejected alternatives, where the design pressures came from. Use it
if the amendment needs relitigation.

## Frame

ADR 0015 (2026-05-16) committed to a two-phase model: Phase 1
`TranslateEntityDialog` for atomic create-translation with in-modal
per-field review; Phase 2 source-locale-aware editing of the target
draft via the `sourceSlot` mechanism on `InlineFieldSuggestion`. The
ADR was right architecturally but landed unevenly in code:

- `IngredientForm` adopted a partial split view via `TranslationCompanion`
  - `FieldWithTranslation` — but only on three fields (name, summary,
    description), with a collapsible chevron on the sibling side.
- `RecipeForm` shows the sibling-locale text nowhere; the "Create
  translation" trigger sits buried inside the language-picker
  metadata card.
- `PairingForm` has no split view at all; its single translatable
  field uses the same `TranslateEntityDialog` flow but renders no
  sibling-aware editing.
- Workflow control placement diverges: `RecipeForm`'s
  `AiSuggestionsIndicator` sits in the right rail; `IngredientForm`'s
  per-field "AI suggest" buttons sit inline; `PairingForm` has
  neither pattern coherently.
- Header/footer affordances diverge: `FormActionBar` lives in
  `IngredientForm` + `RecipeForm` only; `PairingForm` carries a
  custom one-button footer plus a header draft pill plus a flat
  header delete; `IngredientForm` + `RecipeForm` have no delete
  affordance at all.

User's intuition: this was always meant to be one shape. Make it one
shape. Promote split view from "feature on three ingredient fields"
to "the editing surface for translations, period."

A secondary intent crystallised during the grilling: **bidirectional
translation**. Editor opens a DE entity, toggles compare-with-EN,
edits DE while reading EN; or opens EN entity, toggles compare-with-DE,
edits EN while reading DE; or hits a swap-language control to flip
which locale is being authored. The `canonicalLocale` designation
remains in the data model (per ADR 0003 + ADR 0015) but stops being
load-bearing in the UI.

## Codebase context gathered

Three forms, three layouts. Line counts indicative of accumulated
divergence:

- `IngredientForm.tsx` — 1833 lines. SectionNav (w-40) | body |
  CompletenessPanel + PairingSuggestionPanel (w-52). Header has
  Enhance + Translate. `TranslationCompanion` wraps `name`,
  `summary`, `description` only.
- `RecipeForm.tsx` — 2478 lines. Used for both recipes and mixtures
  (`collection` prop). SectionNav (w-40) | body |
  `AiSuggestionsIndicator` + CompletenessPanel (w-56). Header has
  Enhance only; Translate trigger lives inside the language-picker
  metadata card, not the header.
- `PairingForm.tsx` — 686 lines. body | CompletenessPanel (w-52).
  No SectionNav. Custom footer (single Save button). Header has
  draft pill + Enhance + Translate + Delete. Different shape end
  to end.

Shared primitives:

- `AdminShell.tsx` — single collapsible left sidebar for cross-page
  navigation. Persistent across the admin app.
- `FormActionBar.tsx` — sticky bottom bar with Cancel | Preview |
  status pill | split save (Draft / Publish). Used by Ingredient +
  Recipe forms.
- `TranslationCompanion.tsx` + `FieldWithTranslation` — the
  partial-adoption split-view wrapper. Lives in `apps/website/`,
  not the registry. Three-field usage in `IngredientForm` only.
- `SectionNav.tsx` — left-rail TOC.
- `CompletenessPanel.tsx` — right-rail progress ring + field list.
- Registry components consumed: `InlineFieldSuggestion`,
  `AiSuggestionsIndicator`, `SuggestionsOptions`, `UserPromptField`,
  `TranslateEntityDialog`, `useAiSuggestions`,
  `SuggestionFlowProvider`, plus per-kind suggestion rows.

Data model unchanged from ADR 0015:

- `runFill({ sourceContext: { kind: "sibling-locale", … } })` is
  the single runner entry point for translation.
- Per-field `TranslationBehavior` (`translate` / `copy` / `localize`
  / `skip`) on the contract.
- `canonicalFieldHashes` on meta for stale-refresh diffing.
- `translationOf` / `canonicalLocale` / `translationStaleSince` on
  meta sidecars.
- `userPrompt` parameter on `runRefine` is first-class and exposed
  today via the (to-be-deleted) `SuggestionsOptions` menu.

The only AI-runtime change introduced by this amendment is a new
optional `mergeInstruction?: string` parameter on `runFill`.
Everything else is UI/flow.

## Decisions

### Q1 — Frame: ADR 0015 finish vs. new surface

User initially described "a reusable split view for editing
translations side-by-side." Two readings:

(a) A net-new editor surface, parallel to the existing single-field
inline-suggestion mechanism.

(b) Finish what ADR 0015 already committed to (split view is Phase 2),
extending it from three fields to every translatable field and making
it the default when editing a translation draft.

Picked (b). The ADR already locks `sourceSlot` on
`InlineFieldSuggestion` and per-field retranslate as the Phase 2
shape. The "new" surface is ADR 0015 fully implemented across all
three forms — not a parallel system.

User additionally introduced the bidirectional intent: split view
toggle-able from any locale, swap-language to flip editing
direction. The data model already supports this (per-entry
`canonicalLocale`); the UI was the gap.

### Q2 — Phase 1 modal: in-modal review vs. preflight-only

ADR 0015's Phase 1 modal carried two jobs: (i) preflight (locale +
slug picker) and (ii) per-field review of the bulk-fill output
before save. Job (ii) duplicates the split-view review surface and
generated two surfaces for the same editorial intent.

Considered keeping an "expert mode" inside the modal for editors
who want pre-save review. Rejected — bifurcates the UX, doubles the
test surface, and the safety case (LLM produces something
embarrassing) is small for unpublished drafts.

Decided: Phase 1 modal degrades to preflight-only. Bulk fill runs,
draft saves with all suggestions applied, editor lands in split
view with the bulk-fill output as the starting state. Review and
correction happen post-save in the split view.

Partial-failure consequence: if one field's LLM call fails, the
draft saves with whatever succeeded. Toast names the unfilled
fields; editor re-runs failures from the per-field button in split
view. ADR 0015 open follow-up #2 closes by this decision.

The dialog is always shown (including ingredients/pairings without
slug picker). Body collapses to entity summary + Create CTA in that
case. Visual consistency across entity kinds; the saved click is
not worth the divergence.

### Q3 — Translation mode entry, exit, and language switching

Three sub-decisions tangled.

**Entry.** Auto-on when the loaded entity has `translationOf` set.
Manual toggle from a header control on any entity (regardless of
`translationOf` status — bidirectional intent). Phase 1 dialog
redirect lands in split view auto-on.

**Exit.** Same header control toggles off. State persisted globally
in localStorage (single boolean). Per-entity persistence considered
and deferred — global is simpler and the editor is the same human
across entities. Revisit if telemetry surfaces a need.

**Language switching inside split view.** Two readings:

1. Swap which side renders on left vs right — cosmetic.
2. Swap which locale is editable — navigate to the sibling entity's
   edit page; the sibling becomes editable; "discard or save?"
   prompt if dirty.

Picked (2). The whole intent of bidirectional translation is letting
the editor pick direction without back-button gymnastics. (1) is
visual fidgeting.

### Q4 — Sidebar collapse semantics

User asked for "both sidebars" to collapse to icons in split view.
Disambiguated: form-left (`SectionNav`) and form-right
(`CompletenessPanel` + optional blocks). `AdminShell`'s own
sidebar is unaffected — editor-controlled, separate concern,
auto-collapsing it would surprise the user.

Form-left collapses to a vertical icon rail with a TOC icon. Click
opens a popover listing sections; clicking a section scrolls and
closes.

Form-right collapses to a vertical icon rail showing the
completeness ring with % overlaid. Click opens a popover with the
required / recommended / bonus field list.

`PairingSuggestionPanel` (the AI-pairing-proposal block in
`IngredientForm`'s right rail) is hidden in split view entirely.
Pairings are graph edges between locale-shared entities; suggesting
new pairings while the editor is reproducing canonical content in
the target locale is mode-mismatched noise.

### Q5 — Per-field "Translate from sibling" mechanics

Per the user's original #3: per-field button replaces the
single-mode "AI suggest" button. Per ADR 0015: underlying call is
`runFill({ target: [field], sourceContext: { kind: "sibling-locale", … } })`,
suggestion lands in `InlineFieldSuggestion` below the input.

Per-field behaviour by contract `translation.mode`:

- `translate` / `localize` — button labeled "Translate from EN" (or
  DE). Single-field LLM call. Suggestion below input. Apply
  overwrites; the preview itself is the confirmation.
- `copy` — button labeled "Copy from EN". No LLM call. Renders as
  a suggestion-style preview if the target value differs;
  consistent UX with translate mode.
- `skip` — button hidden. Field is locale-invariant (shared slug).

Edge case: target field already has content, editor clicks Translate.
Considered gating behind a "Replace?" confirmation. Rejected — the
suggestion-below-input UX is itself the safety net; gating doubles
the click cost on the dominant happy path.

`translate` and `localize` are UI-identical; only the contract prompt
differs.

### Q6 — Bulk "Translate all" semantics

User's #5 set up a state-machine header button: "Translate all from
EN" → "Apply all (N)" → back to "Translate all" after apply.

Underspecified: scope of the bulk run. Considered:

1. All translatable fields, always.
2. Only empty translatable fields (conservative).
3. Only stale fields per `canonicalFieldHashes`.

Initial recommendation was (1) — suggestions never auto-apply, the
preview is the safety net, LLM cost is admin-volume-negligible.

User overrode with: default is (2) — "fill gaps only" — but the
choice is editor-toggleable via a settings dropdown that offers
exactly (1) and (2). Reasons (extracted from the user's
follow-up): conservative default eliminates suggestion-row noise
for fields with hand-curated content; editor opts into (1) when
they explicitly want a full re-translate.

(3) is the stale-refresh flow per ADR 0015, lives elsewhere; not a
write-policy on this button.

State machine for the sub-header strip:

| State                        | Button                          |
| ---------------------------- | ------------------------------- |
| Single edit, no pending      | "Get AI suggestions"            |
| Single edit, ≥1 pending      | "Accept all (N)"                |
| Translation mode, no pending | "Translate all missing" (combo) |
| Translation mode, ≥1 pending | "Apply all (N)"                 |
| Translation mode, running    | "Translating… (3/12)" disabled  |
| Pairings                     | strip not rendered              |

### Q7 — Footer/header standardisation

Three forms, three different layouts. Standardised:

- **Footer**: `FormActionBar` everywhere. `PairingForm` adopts;
  loses custom one-button footer; header draft pill collapses into
  footer's status pill + split save.
- **Header**: back arrow | title + locale chip + draft badge |
  translation link chips | "Compare with `<sibling>` ↔" toggle |
  Enhance | overflow `⋯`.
- **Delete**: moves into header `⋯` for all three forms.
  `IngredientForm` + `RecipeForm` gain a delete affordance they
  previously lacked (user confirmed: intentional add, not just a
  consistency tax).
- **Translate trigger**: removed from `RecipeForm`'s metadata
  section; replaced by the unified "Compare with `<sibling>` ↔"
  control which opens the Phase 1 dialog (if no translation exists
  in the sibling locale) or toggles split view on (if one does).

Delete-in-overflow chosen over delete-as-flat-header-button: it's
destructive and not the editor's primary intent on most opens.

### Q8 — Layout component: scope and DOM shape

Critical decision: what does "side-by-side" mean in DOM terms?
Three options:

A. Two pane containers, two scroll regions, sync-scrolled.
B. One scroll region; each field renders a two-column row (sibling
read-only | live input).
C. Two iframes / two independent forms.

Picked B. Scroll sync becomes non-existent (one scroll container);
section anchors keep working; completeness tracks editable side
only. The "panes" effect emerges from sidebar collapse + per-field
bisection.

This decomposes the reusable layout into two components:

- `EntityFormLayout` — shell (header / sub-header strip / left rail
  / centre / right rail / footer).
- `FieldWithSibling` — per-field two-column primitive. Renames /
  replaces `FieldWithTranslation`. Drops the existing collapsible
  chevron per user's #2. Applies to every translatable field.

Per-entity form bodies stay per-entity. Three contracts with three
field sets don't generalise cleanly; trying would be a year-long
DDD exercise. Shell + primitive is the right granularity.

### Q9 — Phase 1 modal trimmed shape + partial failure

Dialog body collapses to:

- Always: entity-summary line.
- Recipes/mixtures only: slug picker (auto-suggested via
  `runFill({ target: ["slug"] })`, availability-checked, manual
  override).
- A single "Create & translate" CTA.
- Progress indicator during the bulk run.

Dialog shown always — consistency over a saved click for
ingredients/pairings.

Partial-failure: lenient (per Q2's frame). Save partial draft,
toast names failures, recovery is per-field in split view. Strict
mode (abort-on-any-failure) considered and rejected — burns N-1
successful LLM calls for one failure.

### Q10 — Sub-header strip and registry-location boundary

User's #4 hinted the bulk button replaces the right-rail
`AiSuggestionsIndicator` card. Concretised:

- Introduce a sub-header strip between form header and form body.
- Workflow buttons live there (state-machine per Q6).
- `AiSuggestionsIndicator` block stops rendering in the right rail.
- `SuggestionsOptions` (`Settings2` menu) **deleted entirely** —
  per-field accept/partial/reject is always the UX for refine, no
  write-policy toggle meaningful at the bulk level for refine.
- "Compare with `<sibling>` ↔" toggle stays in the form header (mode
  switch, not workflow action).

Initial location recommendation: `EntityFormLayout` +
`FieldWithSibling` in registry. **User corrected**: layout
components stay in `apps/website/` (they couple to
Spicemixer-specific admin concerns — completeness model, section
structure, locale chips). Only AI-trigger buttons go to the
registry.

Lift the layout to the registry only when a second consumer needs
the shape. Don't pre-architect for a hypothetical consumer.

### Q11 — Bulk write policy default

User's revision to Q6: default is "fill gaps only", primary label
becomes "Translate all missing". Dropdown offers exactly two
choices: fill-gaps and replace-all. No third option, no prompt
mode, no preserve-existing toggle, no per-field custom policy.

Choice persists globally in localStorage. First-time default is
fill-gaps (noise-free common case).

### Q12 — Registry block shape

Considered one bulk-action component with a `mode` prop ("suggest"
| "translate"). Rejected — split-combo + settings menu of the
translate variant is enough structural difference that a `mode`
prop is leaky polymorphism.

Picked: two separate blocks. Plus a third per-field block. Plus
(per Q13) a fourth — totalling four:

- `ai-bulk-suggest-button` (rename from initial `ai-suggest-button`
  per user's clarity push — needs to differentiate from per-field).
- `ai-bulk-translate-button`.
- `ai-field-suggest-button`.
- `ai-field-translate-button`.

All four consume `useAiSuggestions` from the registry; state
machine shared via the hook, not via a `mode` prop.

### Q13 — Per-field combos and "merge with existing"

User added two combo behaviours:

(a) **Per-field suggest** becomes a split combo. Primary CTA "AI
suggest" (configured system prompt). Dropdown reveals a
`<UserPromptField>` textarea for a one-shot custom instruction.
Submit runs the same `runRefine` with `userPrompt` set.

Verified in codebase: `userPrompt` is first-class on `runRefine`,
exposed today through `SuggestionsOptions`'s `<UserPromptField>`.
The deletion of `SuggestionsOptions` repurposes that primitive
inline.

Custom prompt resets per-field, per-open. Considered persisting;
rejected — prompts are usually field-specific ("less marketing-y"
for `summary` doesn't apply to `history`).

(b) **Per-field translate** becomes a split combo. Primary CTA
"Translate from `<sibling>`" (fill / overwrite — current behaviour).
Dropdown alt "Merge with existing" — runs with a fixed merge
instruction.

Implementation of "merge with existing":

1. New editor-side write-policy: `runFill` gains optional
   `mergeInstruction?: string`. When set, prepended to the per-field
   prompt: "Preserve as much of the existing target text as possible;
   integrate sibling content only where absent."
2. New contract translation mode: extend `TranslationBehavior` union
   with `merge`.

Picked (1). Merge-vs-overwrite is an editor intent at click time,
not a contract-level field property. Doesn't require contract
schema changes. Symmetric with the bulk button's write-policy
(also editor-side).

Per-field translate policy persists independently of bulk write
policy. Different axes: "how to write" (overwrite vs merge) vs
"which fields to touch" (gaps vs all).

## What dies

Concrete deletions on adoption:

- Per-field review rows inside `TranslateEntityDialog`.
- `AiSuggestionsIndicator` registry block (replaced by
  `ai-bulk-suggest-button`).
- `SuggestionsOptions` registry block + the standalone `Settings2`
  menu it rendered.
- `TranslationCompanion` + `FieldWithTranslation` in
  `apps/website/`.
- `PairingForm`'s custom footer + header draft pill + header flat
  delete button.
- Per-field "AI suggest" inline JSX scattered across
  `IngredientForm` / `RecipeForm`.
- `RecipeForm`'s in-metadata "Create translation" button.

## What survives

- `runFill` + `runRefine` runner surfaces unchanged (one new
  optional parameter on `runFill`).
- `TranslateEntityDialog` registry block (slimmed body — no review
  rows).
- `InlineFieldSuggestion` + `sourceSlot` mechanism (per ADR 0015).
- `useAiSuggestions` hook + its `siblingLocale` extension.
- `FormActionBar` (now used by all three forms).
- `UserPromptField` (consumed inline by `ai-field-suggest-button`).
- `write-policy-picker` (potentially reused for the bulk-translate
  settings dropdown — verify during implementation).
- All data model: `translationOf`, `canonicalLocale`,
  `canonicalFieldHashes`, `translationStaleSince`,
  per-field `TranslationBehavior`.

## Open follow-ups added by this session

- **Bidirectional staleness.** Staleness anchoring on the original
  canonical locale survives this amendment. If editors routinely
  author DE-first and translate EN, the asymmetry will surface as
  a stale-flag direction issue. Defer until telemetry justifies
  the change.
- **Multi-sibling locales (Phase 3+).** "Compare with `<sibling>`"
  assumes a single sibling. When a third locale enters, the
  control becomes a picker. Trivial; no work until the third
  locale is real.

## Reference

ADR 0015 amendment 2026-05-25 locks the decisions from this session.
Execution detail: `/docs/plans/2026-05-25-translation-split-view.md`.
Companion to the original 2026-05-16 translation-flow research
(`/docs/research/2026-05-16-content-ai-translation-flow.md`) which
this session amends.
