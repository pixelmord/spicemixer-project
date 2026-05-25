# Translation split view as the editing surface — 2026-05-25

Execution plan for the ADR 0015 amendment of 2026-05-25. Companion
research at `/docs/research/2026-05-25-translation-split-view.md`.

The work is grouped by **layer**, not by **form**. Per-form rollout
is the last layer — by then the shared scaffolding exists.

## End state

- Three forms (`IngredientForm`, `RecipeForm`, `PairingForm`)
  consume one shared `EntityFormLayout` shell and one shared
  `FieldWithSibling` per-field primitive.
- Editing a translation draft (`translationOf` set) auto-renders
  split view; any entity can toggle split view on from a
  "Compare with `<sibling>` ↔" header control.
- `TranslateEntityDialog` is a preflight-only modal. Bulk fill runs,
  draft saves, editor lands in split view post-save.
- Workflow controls (suggest / translate, bulk) live in a sub-header
  strip owned by the layout. AI-trigger buttons ship as four new
  registry blocks.
- `FormActionBar` is the unified footer across all three forms.
  Delete moves into the header overflow `⋯`. `PairingForm`'s
  custom footer + header draft pill are deleted.
- `TranslationCompanion`, `FieldWithTranslation`, `AiSuggestionsIndicator`
  (registry export), and `SuggestionsOptions` are removed.
- `runFill` gains one optional `mergeInstruction?: string`
  parameter. No other AI-runtime changes.
- No data-migration: meta sidecar shape unchanged.

## Sequence

Ten steps. Each step lands in its own PR and is independently
shippable behind the existing single-edit fallback until step 9
flips the default.

### Step 1 — `runFill.mergeInstruction` parameter

Substrate change in `@pixelmord/content-ai-ingest` (and core types
in `@pixelmord/content-ai-core` if the parameter is declared there).

- Add optional `mergeInstruction?: string` to `runFill`'s parameter
  type.
- Dispatch path: when `mergeInstruction` is set on a
  `sibling-locale` source run, prepend it to the per-field
  user-message. Document the canonical merge instruction string in
  a constant — editor surface always uses the same wording so trace
  events remain comparable.
- Tests: per-field merge run with empty target, with short target,
  with long target. Snapshot the assembled prompt; assert the
  instruction lands ahead of the field-specific user-message.
- No change for non-sibling-locale source kinds (file / text /
  prompt). Parameter is silently ignored — assert via a unit test.

### Step 2 — `useAiSuggestions` per-field merge affordance

Registry hook change in
`apps/registry/src/components/use-ai-suggestions.tsx`.

- `forField(name)` gains a `retranslate({ merge?: boolean })`
  method (extending the existing `retranslate` shape from ADR 0015's
  `siblingLocale` extension). When `merge` is true, the underlying
  `runFill` invocation passes `mergeInstruction` (the canonical
  constant from step 1).
- No change to the suggestion-handling shape — output is still an
  `InlineFieldSuggestion` row below the input. Apply / Reject
  behave identically.
- Tests in `apps/registry/tests/` for both `merge: false` (default)
  and `merge: true` paths.

### Step 3 — Four new registry blocks

In `apps/registry/src/components/`:

- `ai-bulk-suggest-button.tsx` — refine bulk action. Reads
  `useSuggestionFlowContext()`. States: idle ("Get AI suggestions")
  / running (spinner) / has-pending ("Accept all (N)"). Single
  button, no dropdown. Calls `flow.run()` / `flow.acceptAll()`.
- `ai-bulk-translate-button.tsx` — translate bulk action. Split
  combo. Primary CTA reads the editor's persisted write policy
  (localStorage key `bulkTranslateWritePolicy`, values
  `"fill-gaps"` (default) | `"replace-all"`). Dropdown surfaces
  exactly the two policy options. Calls `flow.run({ target: emptyFields })`
  in fill-gaps mode, `flow.run({ target: allTranslatableFields })`
  in replace-all mode. States: idle ("Translate all missing" or
  "Re-translate everything") / running ("Translating… N/M",
  disabled) / has-pending ("Apply all (N)").
- `ai-field-suggest-button.tsx` — per-field refine. Split combo.
  Primary CTA "AI suggest" runs `forField(name).run()`. Dropdown
  reveals a `<UserPromptField>` textarea + Submit. Submit runs
  `forField(name).run({ userPrompt })`. Textarea resets when
  dropdown closes.
- `ai-field-translate-button.tsx` — per-field translate. Split
  combo. Primary CTA label is "Translate from `<sibling>`" for
  `translate` / `localize` modes, "Copy from `<sibling>`" for
  `copy` mode. Dropdown surfaces "Merge with existing" alt for
  `translate` / `localize` modes only (merge has no meaning for
  `copy`). Primary calls `forField(name).retranslate()`; merge alt
  calls `forField(name).retranslate({ merge: true })`. Not
  rendered for `skip`-mode fields.

Each block exports a `.json` recipe under
`apps/registry/public/r/` per the existing registry convention
(see existing `ai-suggestions-indicator.json`).

Tests in `apps/registry/tests/` per existing pattern: render with
a mock flow context, assert button states and click handlers.

### Step 4 — Delete dead registry blocks

In `apps/registry/src/components/`:

- Delete `ai-suggestions-indicator.tsx` + its `.json`. Replace any
  internal references with `ai-bulk-suggest-button`.
- Delete `suggestions-options.tsx` + its `.json`. The
  `<UserPromptField>` primitive survives; only the wrapper menu
  goes.

Update `apps/registry/src/components/index.ts` (if present) and
the registry's published manifest.

### Step 5 — `TranslateEntityDialog` trim

In `apps/registry/src/components/translate-entity-dialog.tsx`:

- Remove the per-field suggestion-row review block from the
  dialog body.
- Keep: locale picker (when `availableLocales.length > 1`), slug
  picker (when `onCheckSlugAvailable` provided — i.e.
  recipes/mixtures only), "Create & translate" CTA.
- Add: progress indicator during the bulk run ("Translating N of M
  fields…").
- On completion, invoke `onComplete(newRef)` immediately — let the
  consumer redirect. No in-modal preview state to dismiss.
- On partial failure: still invoke `onComplete` with the partial
  set; pass failure metadata so the consumer can surface a toast.

Update tests under `apps/registry/tests/` — drop the per-field
review assertions; add partial-failure-path assertions.

### Step 6 — `EntityFormLayout` + `FieldWithSibling` in website

New files in `apps/website/src/components/admin/`:

- `EntityFormLayout.tsx`. Props:
  - `title: string`
  - `localeChip: ReactNode`
  - `headerAuxiliary?: ReactNode` (e.g. translation link chips,
    Enhance button — consumer-rendered)
  - `overflowMenuItems: { label, icon, onClick, destructive? }[]`
  - `sections: { id, label }[]`
  - `completenessPanel: ReactNode` (consumer renders
    `CompletenessPanel`; layout handles the rail-collapse wrapper)
  - `extraSidebarBlocks?: ReactNode` (hidden in split view)
  - `subHeaderStrip?: ReactNode` (consumer passes the appropriate
    registry button for the current mode; pairings pass null)
  - `footer: ReactNode` (consumer passes `FormActionBar`)
  - `splitView: boolean`
  - `siblingLocale?: string`
  - `onToggleSplitView: () => void`
  - `onSwapLanguage?: () => void` (rendered in header when split
    view is on; consumer handles dirty-prompt + navigation)
  - `children: ReactNode` (form body)
- `FieldWithSibling.tsx`. Props:
  - `label: string`
  - `fieldKey: string`
  - `siblingValue?: unknown` (read-only display)
  - `siblingLocale?: string`
  - `splitView: boolean`
  - `children: ReactNode` (the editable input)
    Renders single-column outside split view; two-column with sibling
    read-only display alongside the input inside split view. No
    collapsible chevron.

Persistence: the split-view toggle reads/writes `splitViewEnabled`
in localStorage. Helper hook `useSplitViewPreference()` in
`apps/website/src/hooks/`.

Tests under `apps/website/tests/` covering: split-view toggle
persistence, rail-collapse renders icon + popover, overflow menu
renders + handlers fire, section anchors still scroll.

### Step 7 — Sibling-data fetching helpers

Per ADR 0015, sibling data is pre-fetched and passed as a prop to
`useAiSuggestions` (the hook stays sync). The forms need a uniform
way to fetch it.

- Add a `getSiblingEntity({ kind, slug, locale })` action wrapper
  in `apps/website/src/actions/index.ts` (if not already present)
  or a thin client-side hook in `apps/website/src/hooks/`.
- For each form, fetch sibling data on mount (or on split-view
  toggle) and pass to `useAiSuggestions({ siblingLocale: { ref, data, locale, fieldHashes } })`.
- For ingredients/pairings sharing slugs across locales, the
  sibling lookup is by `<sibling-locale>/<slug>`. For recipes/
  mixtures the sibling lookup is by `translations[<sibling-locale>]`
  on the meta sidecar (it's a different slug).

### Step 8 — `PairingForm` shell adoption

Smallest form, easiest to migrate first.

- Wrap in `EntityFormLayout`. Pass header items (Enhance + overflow
  with Delete).
- Replace custom footer with `FormActionBar`. Remove the header
  draft pill — `FormActionBar` carries it.
- Wrap the `description` field in `FieldWithSibling`.
- `subHeaderStrip` is `null` for pairings (single translatable
  field).
- Per-field translate button: `ai-field-translate-button` replaces
  the existing inline "Translate" pattern.
- Phase 1 dialog stays — it's the entry from canonical-locale
  pairing to create the sibling.
- Per-field suggest button: existing inline pattern replaces with
  `ai-field-suggest-button` (single edit mode only).
- Manual smoke: create a pairing, toggle compare with DE, translate
  description, swap language, save in either direction.

### Step 9 — `IngredientForm` shell adoption

Medium-sized.

- Delete `TranslationCompanion` + `FieldWithTranslation` usage.
  Replace with `FieldWithSibling` on every translatable field
  (currently only 3 wrapped; this expands to ~11 per the contract
  in ADR 0015).
- Wrap in `EntityFormLayout`. Header overflow gets Delete + (new)
  Open meta sidecar + View public page.
- `subHeaderStrip` passes `ai-bulk-suggest-button` in single edit
  mode, `ai-bulk-translate-button` in translation mode (computed
  from `splitView` prop).
- `extraSidebarBlocks` continues to render `PairingSuggestionPanel`
  in single edit mode; hidden in split view.
- Per-field suggest buttons → `ai-field-suggest-button`. Per-field
  translate buttons (new in this form) → `ai-field-translate-button`.
- Inline "AI suggest slug" affordance in the new-ingredient form
  unchanged — slug is shared across locales, separate concern.
- Manual smoke: create, edit, toggle compare, translate-all-missing,
  apply-all, edit per-field with merge mode, swap language, delete.

### Step 10 — `RecipeForm` shell adoption (recipes + mixtures)

Largest.

- Same migration pattern as ingredient. Wrap each translatable
  field in `FieldWithSibling`. Wrap in `EntityFormLayout`.
- Header: Translate trigger moves out of metadata section into the
  unified "Compare with `<sibling>` ↔" header control.
- Footer: `FormActionBar` (already present; nothing to migrate).
- `subHeaderStrip` per mode.
- Header overflow gains Delete + Open meta sidecar + View public
  page.
- Slug picker survives in the Phase 1 dialog path (only
  recipes/mixtures hit `onCheckSlugAvailable`).
- Language picker in metadata section — keep for now as a
  read-only display + chip; the editing affordance moves to the
  header swap-language. Reconsider deletion in a follow-up.
- Mixtures and recipes share `RecipeForm`; the migration covers
  both `collection` values in one pass.
- Manual smoke: end-to-end for recipes; end-to-end for mixtures;
  verify slug-pick path in Phase 1; verify partial-failure recovery.

### Step 11 — Delete dead code

After all three forms migrate:

- Delete `apps/website/src/components/admin/TranslationCompanion.tsx`.
- Delete the `FieldWithTranslation` export.
- Delete the `AiSuggestionsIndicator` re-export shim
  (`apps/website/src/components/admin/AiSuggestionsIndicator.tsx`)
  and any unused imports.
- Delete the `SuggestionsOptions` re-export shim if present.
- Grep for the strings `TranslationCompanion`, `FieldWithTranslation`,
  `AiSuggestionsIndicator`, `SuggestionsOptions` across the
  repo; resolve any remaining references.

### Step 12 — Tests + smoke

- `pnpm run check` (lint + typecheck).
- `pnpm run test` (unit + integration).
- Playwright smoke for each form: create / edit / translate /
  delete in both single-edit and split-view modes.
- Manual visual regression on the three forms (the geometry change
  is significant; screenshots before/after).

## Out of scope for this plan

These stay deferred per the amendment's open follow-ups:

- Bidirectional staleness model. `translationStaleSince` and
  `canonicalFieldHashes` keep anchoring on `canonicalLocale`.
- Multi-sibling locale picker (waits for Phase 3 locale).
- Lifting `EntityFormLayout` / `FieldWithSibling` into the registry.
  Stays website-local until a second consumer needs it.
- Removing the metadata-section language picker in `RecipeForm`.
  Stays as read-only display until a follow-up justifies removal.

## Risks

- **Form-body churn.** Three forms, ~5000 lines total, all wrapping
  fields with a new primitive. High mechanical risk; mitigated by
  per-form PRs and per-form Playwright smoke.
- **Sibling-data fetch latency in split view.** Toggle-on triggers
  an action call. If slow, the UI shows empty sibling slots
  briefly. Mitigation: render skeleton placeholders during fetch,
  not nothing.
- **localStorage persistence collision.** Existing keys for the
  admin-shell sidebar (if any) live in the same namespace. Pick
  `spicemixer.splitViewEnabled` and `spicemixer.bulkTranslateWritePolicy`
  to scope.
- **Partial-failure UX.** A failed Phase 1 field surfaces only as a
  toast in the new draft. Editor may miss it. Mitigation: also
  render a banner at the top of the form in split view listing
  unfilled fields; dismissible.
- **Registry block adoption order.** Steps 3 + 4 (registry add +
  registry delete) want to ship before forms migrate (step 8+),
  but the website forms still import the old `AiSuggestionsIndicator`
  shim. Solution: keep the shim through step 8; delete in step 11.
- **Discard-or-save prompt on swap-language.** Browser-native
  `confirm()` works but is ugly. If a custom modal is needed,
  factor a small `useDirtyConfirm()` hook in step 6.

## Reference

ADR 0015 amendment 2026-05-25 (the canonical decision record).
Research: `/docs/research/2026-05-25-translation-split-view.md`.
Companion plan: `/docs/plans/2026-05-16-content-ai-translation-flow.md`
(the predecessor plan; this amends it in spirit but does not
supersede — that plan's runner/contract work survives unchanged).
