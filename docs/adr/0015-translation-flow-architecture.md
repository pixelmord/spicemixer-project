# Translation flow architecture: runFill with sibling-locale source, two-phase editorial model

Translation is a **whole-entity fill operation**, not a per-field
refine preset. The content-ai runner (`runFill`) consumes a typed
`sibling-locale` source-context kind that carries the canonical-locale
record's content plus per-field hashes. The contract declares per-field
translation behavior (`translate` / `copy` / `localize` / `skip`). The
editor's workflow has two phases: Phase 1 creates a target-locale draft
atomically with bulk-accept review; Phase 2 edits the draft per-field
with source-locale text rendered alongside each input and a "Retranslate
from `<sourceLocale>`" affordance.

Stale translations refresh field-by-field via per-field source-hash
diffing recorded in the meta sidecar's `canonicalFieldHashes`.

This ADR is mandatory because it is **hard to reverse** (touches the
runner shape, contract type, meta sidecar payload, registry block
inventory, and several Astro action surfaces), **surprising without
context** (future readers will ask why translation isn't a refine
preset and why the runner has a `sibling-locale` source kind), and the
result of a **real trade-off** (declined the preset framing in ADR 0004,
declined a separate `runTranslate` runner, declined a separate
`TranslationDialog` block, declined whole-entity stale refresh).

## Why this ADR exists

Two preconditions converged in 2026-05-16:

1. The lift plan
   (`/docs/plans/2026-05-15-content-ai-package-lift.md`) carved
   `runFill` and `runRefine` as the two capabilities the content-ai
   substrate exposes.
2. Spicemixer's existing translation surface was structurally
   incoherent — the inline `translate` op on `AiAssistPanel` mutated
   the source record's fields with target-locale text, producing
   mixed-language entities. The wording in ADR 0004 ("translate-\*
   presets are suggestion-only") had invited that pattern.

A grilling session
(`/docs/research/2026-05-16-content-ai-translation-flow.md`) walked
thirteen design branches. The decisions ratified there land in this
ADR. The plan
(`/docs/plans/2026-05-16-content-ai-translation-flow.md`) carries the
execution sequence.

## Locked: translation is fill with sibling-locale source

```ts
type SiblingLocaleSource<S> = {
  kind: "sibling-locale"
  sourceRef: EntityRef
  sourceData: z.infer<S>
  sourceLocale: string
  targetLocale: string
  fieldHashes: Record<FieldPath<S>, string>
}

type FillSource =
  | { kind: "file"; … }
  | { kind: "text"; … }
  | { kind: "prompt"; … }
  | { kind: "sibling-locale"; … }   // this ADR

runFill<S, Source extends FillSource>({
  contract,
  sourceContext: Source,
  currentData?,
  target?,
  …
})
```

The runner branches on `sourceContext.kind === "sibling-locale"` to:

- Apply the auto-apply hard rule: `autoApply.policy = "never"` for
  every field, regardless of contract config. This is structural —
  contracts cannot override.
- Dispatch per-field by the field's `translation` mode (see below).
- Emit a single `ingested` event for the whole operation on save
  (per ADR 0004 / amended); no per-field `accepted` events during
  Phase 1.

No new runner. No new package. `runFill` absorbs translation via the
polymorphic source type the lift plan already defined.

The `translate-*` preset family from the original ADR 0004 framing is
removed. Translation is **not a preset**. Presets remain
exclusively for refine-side user intents (`expand`, `tone`,
`research`).

## Locked: per-field translation behavior on the contract

```ts
type TranslationBehavior =
  | { mode: "translate" } // LLM produces target-locale rendering
  | { mode: "copy" } // pass-through; no LLM call
  | { mode: "localize"; instruction?: string } // LLM proposes fresh in target; source as reference
  | { mode: "skip" }; // not filled in translation mode

type FieldConfig<S, Source> = {
  systemPrompt: (ctx: PromptContext<S, Source>) => string;
  autoApply: AutoApplyPolicy | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy);
  presetIds: string[];
  writePolicy?: FieldWritePolicy<unknown>;
  translation?: TranslationBehavior; // defaults to "translate"
};
```

Defaults to `translate` if omitted. Spicemixer's three contracts
declare per-field configuration roughly as:

| Field family                                       | Behavior                                     |
| -------------------------------------------------- | -------------------------------------------- |
| Prose (`description`, `summary`, `culinaryUse`, …) | `translate`                                  |
| `name`                                             | `translate`                                  |
| `region[]` (closed-enum codes)                     | `copy`                                       |
| `botanicalName` (Latin)                            | `copy`                                       |
| `images[]` URL + filename                          | `copy`; caption fields translate             |
| `sources[]` URL                                    | `copy`; title translates                     |
| `tags[]` (per-locale vocabulary)                   | `localize`                                   |
| `recipeCuisine`                                    | `translate` (constrained labels)             |
| `slug` (recipes / mixtures)                        | `translate`                                  |
| `slug` (ingredients / pairings)                    | not a fillable field — shared across locales |

`copy` fields skip the LLM call entirely. This is the largest single
cost saver — a typical recipe translation avoids ~12 LLM calls.
Combined with field-diff-aware stale refresh (below), it enables
zero-LLM refresh in the common case where only `copy` fields differ.

## Locked: field-diff-aware stale refresh

Translation meta carries:

```ts
canonicalFieldHashes: Record<FieldPath, string>;
```

Snapshotted at translation creation and at each refresh. `flagTranslationsStale` (existing) continues to stamp
`translationStaleSince` when the source-locale record's content
changes; the refresh operation now diffs field-by-field:

1. Compute current source-locale field hashes (same hash function as
   `aiEvents.suggestion.hash`; first-12-hex SHA-256 of normalized
   field value per ADR 0004's hash function).
2. Diff against `canonicalFieldHashes` → identify changed fields.
3. For `copy`-mode changed fields: directly propagate new source
   value; no LLM call.
4. For `translate` / `localize` changed fields: `runFill({ target: [changedFields], sourceContext: …, currentData: existingTranslation })`.
5. Editor reviews the (typically small) changed set in the Phase 1
   dialog parameterized for refresh.
6. On save: `canonicalFieldHashes` updates to current source hashes;
   `translationStaleSince` clears.

Manual hand-localized non-stale fields survive automatically — they
are not in the changed set, not re-proposed, not touched. If zero
`translate` / `localize` fields changed (only `copy` differences),
the dialog auto-propagates and saves silently with a toast.

## Locked: two-phase editorial model

**Phase 1 — translation creation (atomic).**

The editor invokes "Translate to `<targetLocale>`" from the
source-locale entity (or a dedicated translate-this-record action).
`TranslateEntityDialog` opens with:

1. Locale picker.
2. (Recipes / mixtures only) slug picker, auto-suggested via
   `runFill({ target: ["slug"], sourceContext: { kind: "sibling-locale", … } })`. Availability check via consumer's
   `onCheckSlugAvailable` callback. Editor can manually override.
3. "Create & translate" CTA. Dialog runs `runFill({ target: ["all other fields"], … })`. (Locale, slug) tuple held in-memory; no
   disk write yet.
4. On fill completion: per-field rows render using
   `InlineFieldSuggestion` with `sourceSlot` populated (3-column:
   source | empty current | proposed target).
5. Primary CTA: **"Accept all & save draft."** Default path is one
   click. Secondary disclosure: "Review N fields →" expands per-field
   review for the cautious editor.
6. On save: consumer's `onCreate` writes new entity + meta atomically.
   Meta carries `translationOf`, `canonicalLocale`,
   `canonicalFieldHashes`, `draft: true`, and a single `ingested`
   aiEvent.
7. Redirect to the new draft's edit page (Phase 2).

Half-states are not possible: either the translation is saved as a
draft (with content), or the operation didn't complete.

**Phase 2 — translation editing (per-field, source-aware).**

The editor opens the draft (now or later). The form renders with
source-locale text alongside each field's input via the `sourceSlot`
mechanism. Three improvement paths per field:

1. **Manual edit** — type directly.
2. **Refine presets** (`expand`, `tone`, `research`, …) — same as on
   any non-translation entity. Refine never invokes the sibling-locale
   source; the source-side render is purely UI context.
3. **Retranslate from `<sourceLocale>`** — single-field
   `runFill({ target: [field], sourceContext: { kind: "sibling-locale", … } })`.
   - Default placement: the `InlineFieldSuggestion`'s **⋯ menu**,
     low-visibility.
   - Promoted to a **prominent inline button** when
     `forField(field).isStale` (per-field source hash differs from
     `canonicalFieldHashes[field]`).
   - Hidden on `copy`-mode fields (no LLM proposal possible) and
     `skip`-mode fields.

Per-field `accepted` / `rejected` events emit normally on Phase 2
operations. Suppression and dedup machinery (ADR 0004) applies as
usual.

## Registry block: TranslateEntityDialog

The new translation surface ships as a `@pixelmord/ui-registry` block
(per the registry plan,
`/docs/plans/2026-05-15-content-ai-ui-registry.md`):

```
TranslateEntityDialog
  props: {
    contract: AiContract<S>
    sourceRef: EntityRef
    sourceData: z.infer<S>
    availableLocales: string[]
    onCheckSlugAvailable?: (collection, slug) => Promise<boolean>
    onCreate: (targetLocale, slug?, fields, meta) => Promise<EntityRef>
    onComplete: (newRef) => void
    aiEventLog: AiEventLog
    onFill: typeof runFill
    origin: Origin
  }
```

Composes existing primitives (`InlineFieldSuggestion`, `PresetPicker`
is not used — translation has no presets) and the `useAiSuggestions`
hook internally.

`InlineFieldSuggestion` is extended (small, additive):

- New optional `sourceSlot?: ReactNode` for source-locale value rendering.
- Per-field renderers (`TextSuggestionRow`, `TagsSuggestionRow`, …)
  gain a read-only mode for the source side.
- Per-field "⋯" menu gains a "Retranslate from `<sourceLocale>`"
  item that promotes to a prominent inline button when stale.

`useAiSuggestions` is extended (additive):

```ts
siblingLocale?: {
  ref: EntityRef
  data: z.infer<S>
  locale: string
  fieldHashes: Record<FieldPath<S>, string>
}

forField(field): {
  …existing…
  source: unknown | undefined
  sourceLocale: string | undefined
  isStale: boolean
  translationMode: TranslationBehavior["mode"] | undefined
  retranslate: () => Promise<void>
}
```

The consumer pre-fetches sibling data at page load (Astro
`getStaticPaths` / Convex queries) and passes it as a prop; the hook
does not fetch. `isStale` computation centralizes in the hook so the
block (and any consumer) reads a single source of truth.

No `TranslationDialog`-vs-`IngestDialog` split: `IngestDialog`
remains the cold-fill dialog for PDF / text / prompt sources;
`TranslateEntityDialog` is the translation flow. Each has its own
preflight (source picker vs locale + slug picker); both compose the
same review primitives.

## What dies on adoption

- The inline `translate` op in `AiAssistPanel.tsx` (the broken in-place
  rewrite).
- `aiTranslateRecipe`, `aiTranslateIngredient` actions.
- The three `*TranslateModal` components (`TranslateModal`,
  `IngredientTranslateModal`, `PairingTranslateModal`).
- `descriptions: { en, de }` inline shape on pairings (per ADR 0014).
- The `translate-*` preset family in any form.
- Mixed-language entities as a structural possibility (the runner
  prohibits the only code path that produced them).

## What survives in reduced form

- `aiSuggestSlug` is **retained unchanged** for non-translation slug
  generation (recipe creation/editing UI — derives slug from `name`
  via `runRefine`). Translation slug generation goes through
  `aiFillTranslation` with `target: ["slug"]` inside
  `TranslateEntityDialog`. No sibling-locale source exists for
  fresh-recipe slug suggestion, so `runRefine` is the right runner
  here.
- `aiCreateTranslation`, `aiCreateIngredientTranslation`,
  `aiTranslatePairing` become thin Astro action shells around
  `runFill` with sibling-locale source. `TranslateEntityDialog`'s
  `onCreate` prop invokes them.

## Alternatives rejected

- **Translation as a refine preset.** The original ADR 0004 framing.
  Rejected because it invited mixed-language entities and required
  per-field translate-on-existing — the broken pattern. See ADR 0004
  amendment.
- **Translation as a third runner (`runTranslate`).** Considered.
  Rejected because translation is structurally identical to fill with
  a typed source: cold-fill with a sibling-locale source for whole-
  entity creation; single-field fill for retranslate. Adding a third
  runner splits substrate that doesn't need splitting.
- **Translation triggered by a preset on the fill side instead of by
  the source-context kind.** Considered. Rejected because (a)
  presets are user-picked intents and translation isn't picked from
  a list — it's entered from outside; (b) the source-context already
  encodes "we're translating to DE" — a preset duplicates the
  information; (c) locale extensibility — adding locales requires
  no contract changes under the source-context-kind model.
- **One `runFill` call producing the slug alongside everything else
  for recipes / mixtures.** Considered. Rejected because slug
  determines the disk key for the new record; it has to be locked
  before the bulk fill writes anywhere. Two `runFill` calls (one for
  slug, one for everything else) is cleaner than placeholder-key
  rename gymnastics.
- **Whole-entity stale refresh (re-fill every field on every
  refresh).** Considered. Rejected because per-field translation
  behavior (Q7-decided) makes field-aware refresh meaningfully
  cheaper — `copy` fields skip the LLM, manual hand-localizations
  survive, the editorial review surface shrinks to changed-only.
- **One `ingested` + N `accepted` events emitted in Phase 1.**
  Considered. Rejected because Phase 1 is one editorial decision
  ("translate this entity"), not N decisions. Recording N per-field
  acceptances pollutes the suppression history with autonomous
  bulk-accepts that don't carry the same editorial weight as
  deliberate accepts. `canonicalFieldHashes` covers the
  was-this-up-to-date axis; AI Trace covers per-field LLM provenance
  via the ingested `traceId`. Per-field events emit in Phase 2 as
  usual.
- **Dedicated `TranslationDialog` registry block separate from
  `IngestDialog`.** Considered. Rejected because the registry already
  has `IngestDialog` for cold-fill with file / text / prompt sources;
  what translation needs is a different preflight (locale + slug, not
  source picker) plus a `sourceSlot` rendering capability on the
  per-field row primitive. Separate blocks for separate preflights;
  shared primitives for the review surface.
- **Implicit sibling-data fetch inside `useAiSuggestions`.**
  Considered. Rejected in favour of explicit `siblingLocale` prop —
  hook stays sync, no loading state for source rendering, computation
  of `isStale` centralizes once, the contract translates cleanly to
  Convex's query / mutation model in the pixelmord-hq consumer.

## Consequences

### Code

- `content-ai-core` (per the lift plan): the `Source` type union
  gains `{ kind: "sibling-locale"; … }`; `FieldConfig<S, Source>`
  gains optional `translation?: TranslationBehavior`; per-field
  hashing helper + diff helper for `canonicalFieldHashes`.
- `content-ai-ingest`: `runFill` dispatches by per-field
  `translation.mode` when source kind is `sibling-locale`;
  hard-rules `autoApply: "never"` for that kind.
- `@pixelmord/ui-registry`: new `TranslateEntityDialog` block; small
  additive extensions to `InlineFieldSuggestion`, per-field-type
  renderers, `useAiSuggestions`.
- `apps/website` Spicemixer side: contract definitions updated with
  per-field `translation` config; existing translate actions
  reshaped; broken inline `translate` op deleted from
  `AiAssistPanel`; three `*TranslateModal` components removed;
  `flagTranslationsStale` / `listStaleEntries` updated for per-field
  granularity.
- `apps/website` meta sidecar payload gains `canonicalFieldHashes:
Record<FieldPath, string>`. ADR 0013's "meta carries workflow
  state" rule extends; this is per-locale per-translation state and
  fits the existing payload contract.

### Migration

Migration sequence detailed in
`/docs/plans/2026-05-16-content-ai-translation-flow.md`. Ten steps;
each step is bounded. The pairings storage migration (ADR 0014) can
run in parallel with the runner / contract work.

### Documentation

- CONTEXT.md will gain (when adopted) a glossary entry for
  `TranslationBehavior` and a note on the two-phase editorial
  model. The Locale storage section already reflects the pairings
  unification.
- ADR 0004 has been amended (2026-05-16) to clarify that
  translation is whole-entity fill and that per-field
  translate-on-existing is prohibited entirely. The structural
  prohibition lives here; ADR 0004 retains its auto-apply boundary.

### Open follow-ups

These were surfaced during the grilling but are not blocking adoption:

1. **`localize` mode pragmatics.** The "source as reference not
   template" distinction is fuzzy until the first real localize
   prompt is written. v1 may ship using only `translate` and `copy`
   actively; `localize` defers until tags-or-similar drives the
   distinction concretely.
2. **Phase 1 partial-fill failure surfacing.** If a field's LLM call
   fails mid-translation, the `TranslateEntityDialog` needs to
   surface "5 succeeded, 1 failed — retry that one before saving."
   Block-level UX concern; not blocking the architecture.
3. **Sibling-data freshness during long-lived Phase 2 sessions.**
   `translationStaleSince` handles this asynchronously; v1 accepts
   that retranslate may use prop-captured sibling data from page
   load.
4. **Cross-reference UX from source-locale entity.** A "Translations
   of this →" widget surfacing existing translations + stale signals
   - "Translate to …" CTA. Likely yes; separate small UX task.
5. **Variants × translations.** Variant relations are within-locale
   per CONTEXT.md. Translation of a variant: probably the variant of
   the source's translation (`variantOf` points to the translated
   parent in the target locale). Confirm during implementation.
6. **`recipeCuisine` constrained translation.** "Italian" →
   "Italienisch" should be constrained to a canonical per-locale
   label list. Either a prompt-enforced constraint or a closed-enum
   with per-locale display labels. Defer until the flow ships and
   the issue is concrete.

## Reference

Decided in the 2026-05-16 translation-flow grilling session
(`/docs/research/2026-05-16-content-ai-translation-flow.md`).
Execution detail in `/docs/plans/2026-05-16-content-ai-translation-flow.md`.
Companion to ADR 0014 (pairings folder-per-locale), which removes
the last structural exception to the uniform translation flow.
Amendment to ADR 0004 (AI auto-apply boundary) reframes that ADR's
translate clause in light of this decision.

## Amendment — 2026-05-25: split view as the editing surface, Phase 1 collapses to preflight

Decided in the 2026-05-25 grilling session
(`/docs/research/2026-05-25-translation-split-view.md`). Execution
detail in `/docs/plans/2026-05-25-translation-split-view.md`.

The original ADR locked a two-phase editorial model where Phase 1
(`TranslateEntityDialog`) rendered per-field suggestion rows for
in-modal review with "Accept all & save draft" as the primary CTA.
Implementation across the three forms (`IngredientForm`,
`RecipeForm`, `PairingForm`) has surfaced a structural mismatch:
in-modal review duplicates the split-view review surface, the
sibling-aware editing capability landed unevenly (three fields in
`IngredientForm` via `TranslationCompanion`/`FieldWithTranslation`;
absent in `PairingForm` and `RecipeForm`), and the bidirectional
intent of "translate either way" was never realised — the UI is
asymmetric around `canonicalLocale` even though the data model
treats per-entry canonical neutrally (ADR 0003).

This amendment locks the corrections.

### Locked: Phase 1 modal degrades to preflight-only

`TranslateEntityDialog` no longer renders per-field suggestion rows.
Its body is:

- (Always) entity-summary line ("This will create a DE translation
  of cardamom; all translatable fields auto-translate. Review in
  split view after.")
- (Recipes / mixtures only) slug picker with availability check and
  manual override, populated via
  `runFill({ target: ["slug"], sourceContext: … })`.
- A single "Create & translate" CTA.
- Progress indicator during the bulk run ("Translating 5 of 12…").

On run completion the dialog saves the draft and redirects to the
new draft's edit page with split view auto-on (see below). All
review/correction happens post-save in split view; the modal carries
no review surface.

Partial-failure behaviour: lenient. If a field's LLM call fails, the
draft saves with whatever succeeded and the editor lands in split
view with a toast naming the unfilled fields. Recovery is per-field
via the field's translate button. This supersedes open follow-up #2,
which is closed by this decision.

The dialog is always shown, even for ingredients and pairings (where
there is no slug picker). The body collapses to summary + CTA in
that case. Consistency wins; the saved click does not.

### Locked: split view is the editing surface for translations

Phase 2 editing is no longer "a form with optional source rendering
on three fields." It is a uniform split view: every translatable
field renders a two-column row with the sibling-locale value
(read-only, no collapsible) on one side and the editable input on
the other. Non-translatable fields render full-width.

Implementation is per-field, not per-pane: there is one scroll
container; the side-by-side effect emerges from stacking
two-column field rows. Scroll synchronisation is therefore a
non-problem and is not implemented. Section anchors and the
completeness panel continue to track the editable side only.

Split-view entry:

- Auto-on when the loaded entity has `translationOf` set.
- Manual toggle from a header control ("Compare with `<sibling>` ↔")
  available on any entity, regardless of locale or `translationOf`
  status. The toggle state persists globally (single boolean in
  localStorage); per-entity persistence is deferred.
- Phase 1 dialog redirect lands with split view auto-on.

Inside split view, a swap-language control navigates to the sibling
entity's edit page (with a discard-or-save prompt if the current
form is dirty). This realises the "translate either direction"
intent and decouples editing affordance from `canonicalLocale`
designation. Bidirectional staleness is **not** implemented in this
amendment; the existing `canonicalLocale` / `translationStaleSince`
machinery continues to anchor on the original canonical. Whether to
make staleness bidirectional is deferred — open follow-up below.

When split view is on, the form sidebars collapse to vertical icon
rails: a TOC icon (left) opens the section-nav popover; a small
completeness ring (right) opens the field-status popover. The
`AdminShell` sidebar is unaffected.

`PairingSuggestionPanel` (the AI-pairing-proposal block in
`IngredientForm`'s right rail) is hidden in split view — pairings
are not a translation concern.

### Locked: workflow controls live in a sub-header strip

The "Get AI suggestions / Accept all" indicator card moves out of
the right rail. Workflow actions live in a sub-header strip between
the form header and form body, owned by the layout. The strip
renders one of:

| Mode                         | Strip content                                               |
| ---------------------------- | ----------------------------------------------------------- |
| Single edit, no pending      | `ai-bulk-suggest-button` ("Get AI suggestions")             |
| Single edit, ≥1 pending      | `ai-bulk-suggest-button` ("Accept all (N)")                 |
| Translation mode, no pending | `ai-bulk-translate-button` ("Translate all missing", combo) |
| Translation mode, ≥1 pending | `ai-bulk-translate-button` ("Apply all (N)")                |
| Translation mode, running    | progress indicator, disabled                                |
| Pairings (any mode)          | strip not rendered (single translatable field)              |

`SuggestionsOptions` (the `Settings2` menu on the current
`AiSuggestionsIndicator`) is **deleted entirely**. Per-field
accept / partial-apply / reject is always the UX for suggestions;
no write-policy toggle is meaningful for refine.

### Locked: bulk-translate write policy

`ai-bulk-translate-button` is a split combo. Primary CTA uses the
editor's persisted write policy. The dropdown surfaces exactly two
choices:

- **Fill gaps only** (default, label: "Translate all missing") —
  bulk `runFill` runs only against translatable fields whose target
  value is empty.
- **Replace all translations** (label: "Re-translate everything") —
  bulk `runFill` runs against every translatable field; suggestions
  for filled fields render as previews; nothing applies without an
  explicit Apply.

No third option. No prompt mode. No preserve-existing mode. No
per-field policy. Editor's choice persists globally in localStorage.

Stale-refresh remains a separate flow keyed off
`canonicalFieldHashes` per the original ADR; it is **not** a third
write-policy on this button.

### Locked: per-field translate combo

Each translatable field's per-field "AI suggest" button is replaced
in translation mode by `ai-field-translate-button`, a split combo:

- Primary CTA: "Translate from `<sibling>`" (or "Copy from
  `<sibling>`" when the field's contract `translation.mode` is
  `copy` — same combo, different label, no LLM call for `copy`).
  Runs single-field `runFill` with sibling-locale source. Suggestion
  lands in `InlineFieldSuggestion` below the input; Apply overwrites.
- Dropdown alt: "Merge with existing" — runs single-field `runFill`
  with an editor-side merge instruction (see below).

For `skip`-mode fields the button is not rendered.

`runFill` gains an optional `mergeInstruction?: string` parameter.
When set, it is prepended to the per-field prompt as a fixed
instruction: "Preserve as much of the existing target text as
possible; integrate sibling content only where absent." This is an
**editor-side write-policy**, not a contract-side translation mode
— it does not extend `TranslationBehavior`. Per-field translate
policy persists independently of the bulk write policy (different
axes: "how to write" vs "which fields to touch").

### Locked: per-field suggest combo

In single edit mode, each translatable field's "AI suggest" button
becomes `ai-field-suggest-button`, a split combo:

- Primary CTA: "AI suggest" — runs the configured system prompt
  for the field.
- Dropdown: reveals a `<UserPromptField>` textarea for a one-shot
  custom instruction. Submit runs the same `runRefine` flow with
  `userPrompt` set. Custom prompts **reset per-field, per-open**;
  they do not persist across fields.

The `userPrompt` mix-in is already first-class in
`useAiSuggestions` / `runRefine`; this block exposes it inline
without the deleted `SuggestionsOptions` menu.

### Locked: form-shell standardisation

A new `EntityFormLayout` component (in
`apps/website/src/components/admin/`) wraps the common shape:
header (back arrow, title, locale chip, swap-language, translation
links, "Compare with `<sibling>` ↔" toggle, "Enhance", overflow
`⋯`), left rail (`SectionNav`, collapsible to icon rail in split
view), centre (form-body children), right rail
(`CompletenessPanel`, collapsible to icon rail in split view, plus
optional consumer slot for extra blocks), sub-header strip
(workflow buttons per the table above), footer (`FormActionBar`).

All three forms adopt it. Per-entity bodies stay per-entity — the
schemas are too different to abstract beyond the shell. A second
component, `FieldWithSibling`, handles per-field bisection in split
view (replaces `TranslationCompanion`/`FieldWithTranslation`, drops
the collapsible chevron on the sibling side, applies to every
translatable field, not three).

`FormActionBar` is the unified footer for all three forms.
`PairingForm` adopts it and loses its custom one-button footer; the
header draft pill collapses into the footer's status pill + split
save button. Delete moves into the header overflow `⋯` for all three
forms; `IngredientForm` and `RecipeForm` gain a delete affordance
they previously lacked.

### Locked: new registry blocks

Four new blocks land in `@pixelmord/ui-registry`:

- `ai-bulk-suggest-button` — refine bulk action.
- `ai-bulk-translate-button` — translate bulk action with write-policy combo.
- `ai-field-suggest-button` — per-field refine with custom-prompt dropdown.
- `ai-field-translate-button` — per-field translate with merge-mode dropdown.

The form-shell components (`EntityFormLayout`, `FieldWithSibling`)
stay in `apps/website/` — they couple to Spicemixer-specific
admin concerns (sections, completeness, locale chips). Lift to the
registry only when a second consumer needs the shape.

The original ADR's `AiSuggestionsIndicator` registry export is
removed; its inner button mechanics move into
`ai-bulk-suggest-button`. `SuggestionsOptions` and the standalone
`UserPromptField` rendering inside it are removed;
`UserPromptField` survives as a primitive consumed by
`ai-field-suggest-button`'s dropdown.

### What dies on adoption of this amendment

- Per-field review rows inside `TranslateEntityDialog`.
- The `Settings2` write-policy menu on `AiSuggestionsIndicator`.
- `AiSuggestionsIndicator` as a registry block (replaced by
  `ai-bulk-suggest-button`).
- `TranslationCompanion` + `FieldWithTranslation` in
  `apps/website/` (replaced by `FieldWithSibling`).
- `PairingForm`'s custom footer + header draft pill.
- The per-field "AI suggest" inline JSX in `IngredientForm` /
  `RecipeForm` (replaced by `ai-field-suggest-button`).

### Open follow-ups added by this amendment

7. **Bidirectional staleness.** `translationStaleSince` and
   `canonicalFieldHashes` still anchor on the original canonical
   locale. If editors routinely author DE-first and translate to EN,
   the asymmetry will surface — but only as a stale-flag direction
   issue, not an editing-flow issue. Deferred; revisit when
   editorial telemetry surfaces a real case.
8. **Multi-sibling locales (Phase 3+).** "Compare with `<sibling>`"
   assumes a single sibling. When a third locale enters, the
   control becomes a picker. Trivial extension; no work needed
   until the third locale is real.

### Backward compatibility

Data shape unchanged: `translationOf`, `canonicalLocale`,
`canonicalFieldHashes`, `translationStaleSince`, the
`sibling-locale` source kind on `runFill`, and per-field
`TranslationBehavior` all survive verbatim. The amendment is
strictly a UI/flow reshape plus one new optional `runFill`
parameter (`mergeInstruction`). No migration required for existing
entities or meta sidecars.
