# Translation flow on content-ai — 2026-05-16

Plan from the grilling session of 2026-05-16. Thirteen design branches
walked. Sibling to the two 2026-05-15 plans
(`content-ai-package-lift.md`, `content-ai-ui-registry.md`); rides on the
substrate they define.

## Goal

Replace the current translation surface — which is structurally
incoherent and produces mixed-language entities — with a unified
translation flow that fits the lifted `runFill` runner. The new flow:

- Treats translation as a **whole-entity fill operation** with a typed
  sibling-locale source, not a per-field rewrite on an existing record.
- Uses **one runner** (`runFill`) across cross-record (recipes,
  mixtures, ingredients) and within-record (pairings, after migration).
- Surfaces translation review through the existing `InlineFieldSuggestion`
  primitive, extended with a `sourceSlot` for source-locale side-by-side
  rendering.
- Encodes per-field translation behavior (translate, copy, localize,
  skip) in the contract.
- Refreshes stale translations field-by-field via per-field source-hash
  diffing, not whole-entity re-runs.

## The broken state today

Two coexisting translation flows, with incompatible mental models:

1. **`TranslateModal` / `IngredientTranslateModal` / `PairingTranslateModal`** — outside the form. Picks a target locale + (for recipes/mixtures) a slug; calls `aiCreateTranslation` /
   `aiCreateIngredientTranslation` / `aiTranslatePairing`, which translate
   all fields in one LLM round and write the new locale record. Correct
   shape; just monolithic and not on the new runner.
2. **The inline `translate` op in `AiAssistPanel`** — inside the form on
   an existing entity. Calls `aiTranslateRecipe` / `aiTranslateIngredient`
   per-field, accepting suggestions via `onApplyField(field, value)`,
   which mutates **the current record's fields in place**. Result: an
   EN-locale record with DE-translated fields, or a DE-locale record
   with mixed paragraphs — the entity becomes incoherent at the locale
   level. **This is the broken flow this plan eliminates.**

Pairings additionally hold `descriptions: { en, de }` inline in a single
record per ADR 0003 — separate storage shape, separate `*TranslateModal`
component, separate `aiTranslatePairing` action. Three storage shapes,
three translation UIs, two of them broken.

## The architecture

### Translation = fill with sibling-locale source

Translation invokes `runFill` with a typed source-context kind:

```ts
type SiblingLocaleSource<S> = {
  kind: "sibling-locale";
  sourceRef: EntityRef;
  sourceData: z.infer<S>; // canonical-locale record content
  sourceLocale: string; // e.g. "en"
  targetLocale: string; // e.g. "de"
  fieldHashes: Record<FieldPath<S>, string>; // per-field hashes for stale-diff
};
```

The runner branches on `sourceContext.kind === "sibling-locale"` to:

- Hard-rule auto-apply to `"never"` (no contract-level override possible)
- Dispatch per-field by the field's `translation` config (below)
- Emit a single `ingested` event for the operation (not per-field
  acceptances)

There is **no `translate-*` preset family**. Translation is not a
user-picked refine intent — it's a flow entered from the source-locale
entity, with the source-context kind alone signalling translation. The
auto-apply override clause from ADR 0004 moves from preset config into
the runner's hard rule.

Refine never produces translations. Per-field translation rewrites on an
existing record (the broken flow) are prohibited entirely, not just
suppressed.

### Per-field translation behavior on the contract

Each field declares how it derives its value from sibling-locale source.
New axis on `FieldConfig`, distinct from `FieldWritePolicy`:

```ts
type TranslationBehavior =
  | { mode: "translate" } // default for prose: LLM produces target-locale rendering
  | { mode: "copy" } // pass-through from source; no LLM call
  | { mode: "localize"; instruction?: string } // LLM re-proposes for target locale; source as reference, not template
  | { mode: "skip" }; // not filled in translation mode

type FieldConfig<S, Source> = {
  systemPrompt: (ctx: PromptContext<S, Source>) => string;
  autoApply: AutoApplyPolicy | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy);
  presetIds: string[];
  writePolicy?: FieldWritePolicy<unknown>;
  translation?: TranslationBehavior; // defaults to "translate"
};
```

Spicemixer's three contracts will land roughly:

| Field                                              | Behavior                                     |
| -------------------------------------------------- | -------------------------------------------- |
| Prose (`description`, `summary`, `culinaryUse`, …) | `translate`                                  |
| `name`                                             | `translate`                                  |
| `region[]` (closed-enum codes)                     | `copy`                                       |
| `botanicalName` (Latin)                            | `copy`                                       |
| `images[]` URL + filename                          | `copy`; caption fields translate             |
| `sources[]` URL + title                            | `copy` for URLs; title translates            |
| `tags[]` (per-locale vocabulary)                   | `localize`                                   |
| `recipeCuisine` ("Italian" / "Italienisch")        | `translate` (constrained labels)             |
| `slug` (recipes/mixtures)                          | `translate`                                  |
| `slug` (ingredients/pairings)                      | not a fillable field — shared across locales |

`copy` fields skip the LLM call entirely — both at translation creation
and at stale refresh. Saves ~12 LLM calls on a typical recipe
translation, plus enables zero-LLM refresh when only `copy` fields
diverged.

### Two-phase editorial model

**Phase 1 — translation creation (atomic, bulk).**

Editor invokes "Translate to DE" from the source-locale entity. The
`TranslateEntityDialog` block opens:

1. Pick target locale.
2. (Recipes/mixtures) Auto-suggest slug via `runFill({ target: ["slug"], sourceContext: { kind: "sibling-locale", … } })`. Editor reviews,
   availability check via consumer's `onCheckSlugAvailable` prop.
3. Editor clicks "Create & translate".
4. Dialog runs `runFill({ target: ["all other fields"], sourceContext: …, currentData: empty })` — fills every non-skip field.
5. Per-field rows render in the dialog using `InlineFieldSuggestion`
   with `sourceSlot` populated (3-column: source-locale value | empty
   current | proposed target).
6. Primary CTA: **"Accept all & save draft."** Secondary disclosure:
   "Review N fields →" expanding per-field review for the cautious
   editor. Default path is one click.
7. Save: consumer's `onCreate` writes new entity + meta atomically. Meta
   carries `translationOf`, `canonicalLocale`, `canonicalFieldHashes`,
   `draft: true`, plus a single `ingested` aiEvent.
8. Redirect to the new draft's edit page (Phase 2).

Pre-create avoids on-disk half-states: no record exists on disk until
the editor confirms save. The (locale, slug) tuple is held in-memory
during the fill.

**Phase 2 — translation editing (per-field, source-aware).**

Editor opens the draft (now or later). Form renders with source-locale
text alongside each field's input (the `sourceSlot` mechanism). Standard
refine flow applies — `expand`, `tone`, `research` presets work as on
any entity. Plus a **per-field "Retranslate from `<sourceLocale>`"** action:

- Default placement: the `InlineFieldSuggestion`'s **⋯ menu**, low-visibility.
- Promoted to an **inline button** when the field is stale (per-field
  source-hash differs from `canonicalFieldHashes[field]`).
- Hidden on `copy`-mode fields (no LLM proposal possible) and
  `skip`-mode fields.

Retranslate calls `runFill({ target: [field], sourceContext: { kind: "sibling-locale", … } })` — single-field, same auto-apply-never rule,
emits an `accepted` event on save.

### Stale-refresh: field-diff-aware

Translation meta carries `canonicalFieldHashes: Record<FieldPath, string>`, snapshotted at translation creation and at each refresh.
`flagTranslationsStale` (existing) continues to stamp
`translationStaleSince` when the source-locale entity changes; the
**refresh operation** now diffs field-by-field:

1. Compute current source-locale field hashes.
2. Diff vs stored hashes → identify changed fields.
3. For `copy`-mode changed fields: directly propagate new source value,
   no LLM call.
4. For `translate` / `localize` changed fields: `runFill({ target: [changedFields], … })`.
5. Editor reviews the (typically small) set of changed fields in the
   Phase 1-style dialog.
6. On save: meta `canonicalFieldHashes` updates to current source
   hashes; `translationStaleSince` cleared.

Editor's hand-localized non-stale fields stay untouched. If zero
`translate`/`localize` fields changed (only `copy` differences), the
dialog auto-propagates and saves silently with a toast.

### Pairings migration: folder-per-locale

ADR 0003 / ADR 0009's `descriptions: { en, de }` inline pairings shape is superseded by ADR 0014.
Pairings join the folder-per-locale layout (`pairings/<locale>/<id>.json` + `pairings/<locale>/<id>.meta.json`).

Reasons (from grilling):

- Storage-shape uniformity across all four EntityKinds. One translation
  runner, one diff UI, no special cases.
- Per-locale editorial history. Each translation gets its own aiEvents,
  draft flag, completeness tracking.
- Per-locale taxonomy divergence. Today pairings have only a description
  field; future fields (`tags`, `region`, future per-locale categorisation)
  can diverge per locale without storage-shape gymnastics.

Migration is cheap because current content is demo/test material —
trivial migration script for what's worth keeping, deletion for the
rest.

## The capability seam — does it stay?

Yes. Translation is a flavour of fill, not a new capability. The lift
plan's `runFill` absorbs it via the `Source` type parameter:

```ts
runFill<S, Source extends FillSource>({
  contract: AiContract<S, Source>,
  sourceContext: Source,
  …
})

type FillSource =
  | { kind: "file"; … }          // PDF, image (cold-fill)
  | { kind: "text"; … }          // pasted text (cold-fill)
  | { kind: "prompt"; … }        // prompt-driven (cold-fill)
  | { kind: "sibling-locale"; … } // translation (cold-fill or merge)
```

No new package. No new top-level runner. The translation flow earns its
keep through:

- One new source-context kind in `content-ai-core`
- Per-field translation behavior config in `content-ai-core`
- One new registry block (`TranslateEntityDialog`)
- Source-slot rendering on the existing `InlineFieldSuggestion`
- Per-field retranslate exposure on `useAiSuggestions`

## Registry additions

Adds to `@pixelmord/ui-registry`'s v1 inventory:

**New block (1):**

- **`TranslateEntityDialog`** — preflight (locale picker + slug picker
  for kinds with translatable slug) + in-flight progress + Phase 1
  accept-all review + atomic save. Props: `contract`, `sourceRef`,
  `sourceData`, `availableLocales`, `onCheckSlugAvailable?`,
  `onCreate(targetLocale, slug?, fields, meta) → Promise<EntityRef>`,
  `onComplete(newRef) → void`, runner injection.

**Extensions to existing items:**

- **`InlineFieldSuggestion`** gains:
  - `sourceSlot?: ReactNode` for source-locale value rendering (3-column layout)
  - A "Retranslate from `<sourceLocale>`" item in its ⋯ menu when sibling
    source is available and `translation.mode ∈ {translate, localize}`
  - Visual promotion of the retranslate action to a primary inline
    button when `forField(path).isStale`
- **`useAiSuggestions`** gains an optional `siblingLocale` prop:
  ```ts
  siblingLocale?: {
    ref: EntityRef
    data: z.infer<S>
    locale: string
    fieldHashes: Record<FieldPath<S>, string>
  }
  ```
  And per-field accessor extensions:
  ```ts
  forField(field): {
    // … existing …
    source: unknown | undefined
    sourceLocale: string | undefined
    isStale: boolean
    translationMode: TranslationBehavior["mode"] | undefined
    retranslate: () => Promise<void>
  }
  ```
- **Per-field-type renderers** (`TextSuggestionRow`, `TagsSuggestionRow`,
  etc.) gain a read-only mode for `sourceSlot` rendering. Same component,
  same per-field-kind dispatch; just strips accept/reject buttons.

**Total**: 1 new block, 3 small extensions to existing items.
`IngestDialog` is unchanged.

## ADR plan

Three ADR moves:

1. **Amend ADR 0004 (AI auto-apply boundary).** The "translate-* presets
   are suggestion-only" clause is replaced with: *Translation is a
   whole-entity fill operation invoked from the source-locale entity.
   Refine cannot produce translations. Per-field translation rewrites on
   an existing record are prohibited entirely (not just suppressed).
   Auto-apply on translation: `never`, enforced by the runner against the
   `sibling-locale` source-context kind, not against a preset.\* The
   per-field translate preset framing is acknowledged as the wording that
   invited the broken flow.

2. **New ADR 0014 superseding the pairings exception in ADR 0003 and ADR 0009.**
   Title: _Pairings folder-per-locale._ `descriptions: { en, de }`
   collapses to per-locale `description: string`; each locale is its own
   record with its own meta sidecar. Pairings-exception clauses in ADR
   0003 and ADR 0009 marked superseded by this ADR; the rest of those
   ADRs stand.

3. **New ADR 0015 — Translation flow architecture.** Captures: translation = `runFill`
   with sibling-locale source-context kind; per-field `translation`
   config on `FieldConfig`; field-diff-aware stale refresh via
   `canonicalFieldHashes`; two-phase editorial model; `TranslateEntityDialog`
   as registry block. All three ADR criteria satisfied: hard to reverse
   (touches contracts, runner, meta sidecar, registry); surprising
   without context (Q5's "ADR 0004's wording was the bug" is the
   archaeological hint); real trade-off (declined preset framing,
   declined separate `TranslationDialog` block, declined whole-entity
   stale refresh).

## Migration sequence

Throwaway-content-friendly; cheap migration / deletion is acceptable per
the user's explicit confirmation.

1. **Lift plan steps 1-3 first.** Carve `content-ai-core` and
   `content-ai-refine`; rewrite Spicemixer proposers as contracts. This
   plan rides on that substrate.
2. **Add `translation` config to `FieldConfig`** in `content-ai-core`.
   Update Spicemixer's three contracts (recipe, ingredient, pairing)
   with per-field translation behavior. Most fields default to
   `translate`; declare `copy` on URLs/codes/Latin names;
   `localize` on tags.
3. **Implement sibling-locale source-context kind in `content-ai-ingest`.**
   Extend `runFill`'s source-type union; dispatch by per-field
   `translation.mode`; hard-rule `autoApply: never` when source kind is
   `sibling-locale`.
4. **Implement `canonicalFieldHashes` machinery in `content-ai-core`.**
   Per-field hash computation; field-diff helper. Update `flagTranslationsStale` to compute per-field stale signals and update
   `listStaleEntries` to surface field-level granularity.
5. **Migrate pairings to folder-per-locale.** One-shot script: re-emit
   each pairing as two per-locale records, split `descriptions: { en, de }`,
   create per-locale meta sidecars. Existing references via canonical
   id (`slug-a--slug-b`) survive as the within-locale slug. Trash demo
   pairings that aren't worth migrating. Public-site read path: resolve
   translation via `translationOf` + fallback like other kinds. Update
   the pairing detail page + search index.
6. **Add `sourceSlot` to `InlineFieldSuggestion` + `siblingLocale` prop
   to `useAiSuggestions`.** Implement the per-field accessor extensions.
7. **Build `TranslateEntityDialog` registry block.** Preflight, two-call
   `runFill`, Phase 1 accept-all dialog, atomic save, redirect.
8. **Rewire Spicemixer's translation actions:**
   - DELETE `aiTranslateRecipe`, `aiTranslateIngredient` — the broken
     in-place per-field flow.
   - DELETE the `translate` op in `AiAssistPanel`. The block becomes
     ~100 lines lighter; `runTranslate` and `TranslationResult` go.
   - REPLACE `aiCreateTranslation`, `aiCreateIngredientTranslation`,
     `aiTranslatePairing` — Astro action shells around `runFill` with
     sibling-locale source. The `TranslateEntityDialog` block calls
     them via `onCreate`.
   - REDUCE `aiSuggestSlug` to a thin wrapper over `runFill({ target: ["slug"] })`, or delete entirely and let the block call `runFill`
     directly.
9. **Remove `TranslateModal`, `IngredientTranslateModal`,
   `PairingTranslateModal`.** Replaced by `TranslateEntityDialog` pasted
   from the registry.
10. **Tests:** sibling-locale source fill (unit), field-diff-aware stale
    refresh (unit), Phase 1 atomic create end-to-end, Phase 2
    retranslate-this-field end-to-end, `copy`/`translate`/`localize`
    per-field dispatch (unit), per-locale aiEvents isolation
    (integration).

## What dies

- The `translate` op in `AiAssistPanel.tsx` (the inline broken flow)
- `aiTranslateRecipe`, `aiTranslateIngredient` actions
- The three `*TranslateModal` components
- `descriptions: { en, de }` on pairings
- The "translate-\*" preset framing in ADR 0004
- Mixed-language entities as a structural possibility

## What survives in reduced form

- `aiSuggestSlug` → `runFill({ target: ["slug"] })` wrapper, or deleted
- `aiCreateTranslation` / `aiCreateIngredientTranslation` /
  `aiTranslatePairing` → thin Astro action shells around `runFill`

## Cross-references

- `docs/plans/2026-05-15-content-ai-package-lift.md` — the substrate
  this rides on. Translation adds: one source-context kind, one field
  config axis, no new packages.
- `docs/plans/2026-05-15-content-ai-ui-registry.md` — the UI substrate.
  Translation adds: one block (`TranslateEntityDialog`), three small
  extensions (sourceSlot, siblingLocale prop, retranslate exposure).
- `docs/research/2026-05-16-content-ai-translation-flow.md` — the
  brainstorming for this plan; walks all thirteen branches with the
  alternatives considered.
- ADR 0003 — per-entry canonical locale; the pairings-exception clause
  superseded by ADR 0014. The rest of ADR 0003 stands.
- ADR 0009 — locale storage folder-per-locale; the pairings-exception
  clause superseded by ADR 0014. The rest stands.
- ADR 0014 — pairings folder-per-locale (the new ADR superseding the
  exception clauses above).
- ADR 0015 — translation flow architecture (the new ADR carrying this
  plan's runner/contract/registry decisions).
- ADR 0004 — AI auto-apply boundary; amended to reframe translation as
  whole-entity fill rather than per-field preset.
- ADR 0009 — locale storage; pairings join the folder-per-locale rule.
- ADR 0011 — AI observability; trace stack covers per-field LLM
  provenance for translations (the Phase 1 `ingested` event carries the
  traceId).
- ADR 0013 — meta sidecar; gains `canonicalFieldHashes` payload field.
