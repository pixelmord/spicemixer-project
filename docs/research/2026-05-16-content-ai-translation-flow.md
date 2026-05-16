# Translation flow on content-ai — 2026-05-16

Grilling session via `/grill-with-docs`. Walks thirteen design branches
to decide how translation should sit on top of the runner and registry
substrates from the 2026-05-15 lift/registry sessions.

The execution-shaped output lives at
`/docs/plans/2026-05-16-content-ai-translation-flow.md`. This doc
captures the **brainstorming** — what was considered at each branch,
why we rejected alternatives, where the design pressures came from. Use
it if the plan needs relitigation.

## Frame

Continuing from the package-lift session
(`/docs/research/2026-05-15-content-ai-package-lift.md`) and the
UI-registry session (`/docs/research/2026-05-15-content-ai-ui-registry.md`)
which between them defined the three-package layer
(`@pixelmord/content-ai-{core,ingest,refine}`) and the shadcn-style UI
registry (`@pixelmord/ui-registry`). User raised a sibling concern: the
translation surface today is structurally wrong and needs reshaping to
fit the lifted runner.

Specifically the broken pattern: an editor on an EN-locale recipe could
invoke "translate this field" via `AiAssistPanel`, accept the
suggestion, and end up with DE-translated paragraphs sitting in an
EN-locale record. Mixed-language entity by construction. User's
intuition: translation should create a **new** target-locale record
filled from the canonical-locale sibling, not rewrite fields on an
existing one.

## Codebase context gathered

Three translation paths exist today, with different mental models:

1. **`TranslateModal` (recipes/mixtures)** — outside-form modal. Picks
   target locale + translated slug; calls `aiCreateTranslation`. Writes
   a new locale record. Correct shape; monolithic.
2. **`IngredientTranslateModal`** — same shape as #1 but slug is
   shared across locales (per ADR 0009 + ingredient-slug convention).
   Calls `aiCreateIngredientTranslation`.
3. **`PairingTranslateModal`** — pairings hold `descriptions: { en, de }` inline (ADR 0003 exception). Translation fills a missing per-locale
   slot in the same record. Calls `aiTranslatePairing`. No new record.
4. **The inline `translate` op in `AiAssistPanel`** — inside-form
   per-field translate suggestions. `onApplyField(field, value)` mutates
   the current record's fields. **This is the broken flow.** Lives in
   `AiAssistPanel.tsx` around lines 478-498 and 623-640.

The broken flow exists for both `aiTranslateRecipe` and
`aiTranslateIngredient` actions, which return field-keyed translations
that the panel then applies per-field on accept. The actions themselves
work fine; the application site (mutating the source record) is the
bug.

Storage layout (ADR 0009 + existing CONTEXT.md):

- Ingredients/recipes/mixtures: `<collection>/<locale>/<slug>.json` +
  `.meta.json`
- Pairings: flat `<id>.json` with inline locale slots (the exception)

Stale-translation machinery:

- `flagTranslationsStale()` stamps `translationStaleSince` on
  translations when the source-locale record is edited.
- `listStaleEntries()` powers a stale-entries dashboard.
- `canonicalContentHash` exists at whole-record granularity; no
  per-field hashing today.

ADR 0004's wording — "translate-* presets are suggestion-only, never
auto-apply" — gives translation a *per-field-preset\* framing in the
contract surface. User flagged during Q5 that this very wording was
probably what invited the broken in-place-rewrite UX.

## The branches walked

### Q1 — Is translation a `runFill` capability or a `runRefine` capability?

The lift plan splits capabilities along **fill vs refine**: fill ingests
from source material into a fresh schema-valid record; refine operates
on an existing schema-valid record. Translation has features of both —
operates on an existing source record (refine-like) but produces a
fresh target record (fill-like).

Options offered:

- (a) Fill. Sibling-locale source is the polymorphic input; output is a
  proposal for a target-locale record.
- (b) Refine. Translation as a preset operating on an existing record
  per field. (The current broken pattern.)

Recommended (a). Discussed:

- User's own framing — "create new record first, then fill from sibling
  record" — is structurally identical to cold-fill-with-source.
- (b) is what produced the mixed-language entity bug. Per-field
  rewrites on an existing record have no safe semantics when the
  rewrites cross language boundaries.
- The `runFill` runner already accepts an optional `currentData` for
  merge flows; translation slots into the cold-fill or merge variants
  cleanly.

User added: agreed; no case for in-place translation of a single field
on the same record.

**Decision: (a). Translation is a fill capability. The `translate-*`
refine presets disappear from the contract.**

### Q2 — Pairings: unify under the fill runner, or carve out as a third pattern?

Pairings store `descriptions: { en, de }` inline (ADR 0003). Translation
for pairings doesn't create a new record — it fills a per-locale slot
on an existing one. Structurally different from recipes/ingredients.

Options offered:

- (a) Unify under one fill runner via contract-level field targeting
  and consumer pre-fill UI divergence. Recipes/ingredients fill the
  whole new record; pairings fill only `descriptions.${targetLocale}`.
- (b) Carve a third pattern (`runTranslateInPlace`) for pairings.
- (c) Migrate pairings to folder-per-locale (drop ADR 0003 exception)
  so all kinds unify automatically.

Recommended (a), but flagged: is there a near-term plan for (c)?

User responded with a sharp argument for (c), listing real costs of
the inline-descriptions shape:

- Two storage variants to maintain
- Two diff UIs (`PairingDiff` divergent from `RecipeDiff`)
- No separate editorial history per locale
- No separate aiEvents per locale
- Localization-beyond-translation friction: future per-locale tags,
  per-locale categorisation would require schema gymnastics in the
  inline shape
- "I would have never made the decision in the first place"

**Decision: (c). Pairings migrate to folder-per-locale; ADR 0003
superseded. The translation flow then unifies trivially across all
EntityKinds.** CONTEXT.md updated inline during the session.

### Q3 — Slug strategy across locales: shared or per-locale translated?

Today they diverge:

- Ingredients: shared slug (`en/cardamom`, `de/cardamom`)
- Recipes/mixtures: translated per-locale (`en/chocolate-cake`,
  `de/schokoladenkuchen`); `aiSuggestSlug` exists for this
- Pairings: shared by construction (id composed from ingredient slugs)

CONTEXT.md says "Slugs are English-derived by editorial convention …
but not schema-enforced." Recipes already deviate from that convention.

Options offered:

- (a) Per-locale slugs for recipes/mixtures; shared for
  ingredients/pairings (status quo, formalized)
- (b) Homogenize on shared slugs (drop `aiSuggestSlug`; accept SEO cost
  on recipes)
- (c) Homogenize on translated slugs (add slug-picker to ingredients
  and pairings)

Recommended (a). Discussed:

- Recipes are high-SEO-surface destinations; localized URLs outperform
  in target-locale search. Worth the editorial cost.
- Ingredients are reference content where x-locale equivalence is part
  of the meaning. Shared slug encodes that.
- Pairings inherit from ingredients via id composition; no separate
  decision.

**Decision: (a). Per-locale slugs for recipes/mixtures, shared for
ingredients/pairings. Slug becomes a fillable field on recipe/mixture
contracts.**

### Q4 — Source-context kind or preset for translation mode?

If translation is fill (Q1), how does the contract know "this is
translation"? The lift plan's preset model could carry `translate-de`,
`translate-en` presets per the original ADR 0004 framing. Or the
source-context kind (`kind: "sibling-locale"`) could carry the signal
alone.

Options offered:

- (a) Translation is a preset. `translate-de`, `translate-en`, etc.
  Fields opt in via `presetIds`. `autoApplyOverride: "never"` per
  preset.
- (b) Translation is a source-context kind. No translate-\* presets.
  Source-context shape carries the signal. `autoApply: never` is a
  runner hard-rule against the kind.

Recommended (b). Discussed:

- Presets are user-facing intents the editor picks (`expand`, `tone`).
  Translation isn't picked from a menu — it's a flow entered from
  outside (the translate-this-record action). There's no place a
  `translate-de` button reasonably lives in the new architecture.
- The source-context already encodes both "we're translating" and "to
  DE." A preset duplicates the second.
- Locale extensibility: contract stays locale-agnostic under (b);
  under (a) the preset list grows per locale.
- Auto-apply rule is structural to the operation, not configurable per
  contract. Encoding it in the runner is more durable than relying on
  contract authors to set `autoApplyOverride: "never"` on each
  `translate-*` preset.

User added: agreed; and noted that ADR 0004's "translate-* presets are
suggestion-only" wording **was the bug** — by framing translation as a
per-field preset accept/reject, ADR 0004 invited the mixed-language
entity pattern. The wording should be refined to: *translation is a
whole-entity fill operation; per-field translate-on-existing prohibited\*.

**Decision: (b). Source-context kind. Translation presets removed
entirely. ADR 0004 amendment needed.**

### Q5 — Diff UI for translation review: shared `IngestDialog` or dedicated?

The lift plan's `IngestDialog` does cold-fill review: post-run rows of
per-field "current → proposed" diffs. Translation needs side-by-side
source-locale value rendering so the editor can verify faithfulness.

Options offered:

- (a) `IngestDialog` unchanged; source shown via separate
  "open source" affordance. Worst UX.
- (b) `IngestDialog` parameterized with a generic `sourceSlot?`
  parameter on `InlineFieldSuggestion`. 3-column view (source | current
  | proposed) when source is present. Per-field-kind renderers reused
  read-only on the source side.
- (c) Dedicated `TranslationDialog` block separate from `IngestDialog`.

Recommended (b). Discussed:

- (c) doubles the block count, duplicates per-field review machinery,
  invites divergence over time.
- (b) treats source-side rendering as _additive context_ to the
  fill-review pattern. One block, one hook, one event-log shape.
- The renderers (`TextSuggestionRow`, `TagsSuggestionRow`, etc.) gain a
  read-only mode for source rendering. Trivial change.
- 3-column layout collapses on narrow viewports via Tailwind responsive.

User added a sharper framing of the editorial workflow:

> I would like to start a translation flow with the notion: create the
> record for the entity translation, fill in all fields with translated
> content, save and put it in draft. Then either directly after or at a
> later point in time you would want to edit the translation. Then you
> would want to see original content for a field together with the
> translated content and use our suggestion/refine workflow to improve
> some fields either by correcting the translation or by creating a
> localized content that might be tailored to the way of speaking in
> the target language.

This crystallised the two-phase model:

- Phase 1 — atomic whole-entity create + bulk-accept. No per-field
  decisions.
- Phase 2 — per-field source-aware refine + retranslate. The 3-column
  view + sourceSlot lives here.

**Decision: (b). Generic `sourceSlot` parameter; reused across Phase 1
and Phase 2.**

### Q6 — Phase 1 review affordance: accept-all primary, or skip the dialog?

Once two-phase model is decided, the question is what Phase 1 actually
shows.

Options offered:

- (α) `IngestDialog`-style dialog with progress + "Accept all & save
  draft" primary CTA + collapsed disclosure for per-field review.
- (β) No dialog. Background job + toast "translating…" → toast on
  completion → editor opens the draft, which is where review happens.

Recommended (α). Discussed:

- (β) leaves no surface for partial-fill failures, no progress
  visibility on what can be a 15-40s operation, no escape hatch for
  high-stakes review.
- (α) reuses the same registry block primitives; parameterized for
  translation copy + default-collapsed review.
- Cost of (α) is one extra click for the default flow — defensible.

**Decision: (α). `TranslateEntityDialog` (the new block from Q9) carries
Phase 1.**

### Q7 — Per-field translation behavior: declared on the contract?

Sibling-locale fill doesn't behave uniformly. `description` (prose) wants
LLM translation; `region[]` (closed-enum codes) wants pass-through copy;
`tags[]` (per-locale vocabulary, user flagged in Q2) wants fresh
localized proposals; `botanicalName` (Latin) wants pass-through;
`images[]` URLs want pass-through but captions translate; etc.

Options offered:

- (I) Per-field `translation` config on `FieldConfig`:
  ```ts
  translation?: { mode: "translate" | "copy" | "localize" | "skip"; instruction? }
  ```
- (II) Contract-level `localeInvariant: FieldPath[]` list; rest
  translate.
- (III) Sentinel pattern: `systemPrompt` returns `{ copy: true }` to
  trigger pass-through.

Recommended (I). Discussed:

- (II) has no place for `localize`-as-distinct-from-translate. Tags
  become an unprincipled exception.
- (III) sentinel patterns invite drift; rejected.
- (I) maps the three behaviors cleanly:
  - `translate`: LLM produces target-locale rendering (source as
    template)
  - `copy`: value copied verbatim, no LLM call
  - `localize`: LLM proposes fresh in target locale, source as
    reference not template
  - `skip`: not filled in translation mode
- (I) saves LLM calls. A typical recipe has ~12 copyable fields
  (`region[]`, `recipeCuisine`, `images[]`, `sources[]`, `slug`, …).
  Skipping the LLM for these is real latency + cost reduction.
- (I) gives Phase 2's source-side rendering an at-a-glance signal:
  "Copied" / "Translated" / "Localized" badge per field.

Risk acknowledged: `localize` mode's "source as reference not template"
is fuzzy until a real localize prompt is written. Worst case: v1 ships
with only `translate` + `copy` actively used, `localize` deferred.

**Decision: (I). Per-field `translation` config; four modes; defaults
to `translate`.**

### Q8 — Stale-refresh: field-diff-aware or whole-entity?

Existing machinery: `flagTranslationsStale` stamps `translationStaleSince` when
source changes. `canonicalContentHash` exists at whole-record granularity.
The question is what the refresh operation actually does.

Options offered:

- (A) Whole-entity re-fill. Editor reviews per-field proposals,
  accepts/rejects. ~N LLM calls regardless of what actually changed.
- (B) Field-diff-aware. Translation meta carries `canonicalFieldHashes: Record<FieldPath, string>`. Refresh diffs current source vs stored
  hashes → identifies changed fields → dispatches per `translation` mode
  (copy fields short-circuit; translate/localize go to LLM).

Recommended (B). Discussed:

- Q7's per-field translation behavior was the prerequisite. Now that
  contracts declare `copy` vs `translate` vs `localize`, the refresh
  runner can exploit it.
- Stale-refresh is almost always triggered by a small edit. Re-running
  N-1 untouched fields is workflow tax + LLM cost.
- Editor review surface stays small — only changed fields appear in
  the dialog.
- Manual hand-localized non-stale fields survive automatically (no
  re-proposal).
- Schema-migration friendly: new fields appear as "no stored hash" →
  treated as "changed, fill."
- The data needed (per-field hashes) is cheap (~16 bytes/field).

Cost: stale-refresh shares a code path with translation creation but
operates on a populated record. The Phase 1 dialog parameterizes for
this case.

**Decision: (B). Field-diff-aware refresh. `canonicalFieldHashes`
joins the meta sidecar payload.**

### Q9 — Pre-create flow: separate block + slug-pick mechanism?

Phase 1 needs a UI that does: pick target locale → (recipes/mixtures)
pick/suggest slug → kick off fill → review accept-all → save draft →
redirect.

Two sub-questions:

**Q9a. Separate `TranslateEntityDialog` block, or parameterize `IngestDialog`?**

Options offered:

- Separate block. Composes `InlineFieldSuggestion` primitives; own
  preflight (locale + slug picker, not source picker); own header copy.
- Parameterize `IngestDialog`. Adds a "translation tab" alongside
  file/text/prompt tabs.

Recommended: separate block. Discussed:

- `IngestDialog`'s preflight is `FileTextPromptSourcePicker`; sibling-
  locale has no file/text/prompt input. Conceptual fit is wrong.
- Separate block keeps each dialog's concerns clean. Both compose the
  same row primitives.

**Decision: separate block `TranslateEntityDialog`.**

**Q9b. Slug-suggestion mechanism for recipes/mixtures.**

Slug has to be determined before the rest of the fill runs.

Options offered:

- (β1) Two `runFill` calls: first `target: ["slug"]`, then `target: ["everything else"]`.
- (β2) Dedicated `onSuggestSlug` prop; consumer implements per their
  conventions.
- (β3) One `runFill`, slug in output, post-hoc disk rename of
  placeholder file.

Recommended (β1). Discussed:

- (β1) keeps one runner, one event-log shape. Slug proposal is just an
  `accepted` event with its own hash like any other field.
- (β1) lets the slug field's `systemPrompt(ctx)` access sibling-locale
  context the same way every other field does.
- (β1)'s two-call latency cost is small; slug call is single-field,
  fast, shares prompt prefix with the bulk call.
- (β2) fragments the AI surface after the lift just consolidated it.
- (β3)'s placeholder file invites bug class: half-written disk state
  if save fails. Avoided by holding (locale, slug) in-memory until
  save.

**Decision: (β1). Two `runFill` calls.** And: no record exists on disk
until the editor confirms save. (locale, slug) held in-memory during
fill.

### Q10 — Phase 2 retranslate-this-field UI placement

In Phase 2 the editor is in the target-locale form. Three distinct
improvement paths per field: manual edit, refine preset, retranslate
from source.

Options offered:

- (γ1) Inline button on each field's source-side area, conditional on
  entity having `translationOf` and field's translation mode being
  `translate`/`localize`.
- (γ2) Resurrect a `retranslate` preset on refine. (Contradicts Q4.)
- (γ3) Per-field "⋯" menu with Retranslate / Refine / Reset to source.

Recommended (γ1). User refined: γ1 with retranslate in the **⋯ menu**
by default, **promoted to a prominent inline button** when the field is
stale (per-field source hash differs from `canonicalFieldHashes[field]`).
Reset-to-source dropped — no compelling case.

The refinement is a nice composition with Q8's staleness machinery: the
same per-field hash signal that powers the global stale-entries
dashboard also drives in-form retranslate prominence.

**Decision: γ1 refined — Retranslate in ⋯ menu, promoted inline when
field is stale. Reset-to-source dropped.**

### Q11 — Hook surface for translation

For Phase 2's per-field source-aware rendering + retranslate, the
`useAiSuggestions` hook needs sibling-locale data accessible.

Options offered:

- (η1) Implicit: hook reads meta's `translationOf`, fetches sibling via
  a `siblingLocaleAdapter` prop on mount.
- (η2) Explicit: hook accepts optional `siblingLocale` prop with
  pre-fetched data + per-field hashes.
- (η3) Locale-agnostic: each `InlineFieldSuggestion` gets `sourceValue`
  - `onRetranslate` props per-field from the consumer.

Recommended (η2). Discussed:

- Astro pages already fetch sibling data trivially at page load via
  `ContentStore.read`. One extra read; one prop passed.
- (η2) keeps the hook synchronous — no async fetch on mount, no
  loading state for sourceSlot rendering.
- `isStale` computation centralizes in the hook (one place to maintain
  per-field hash-diffing).
- (η1) couples to ContentStore mental model; doesn't translate to
  Convex's query/mutation distinction in pixelmord-hq.
- (η3) forces per-field prop threading; the registry's whole purpose
  is reducing that burden.

Concrete addition:

```ts
useAiSuggestions(args: {
  …
  siblingLocale?: { ref, data, locale, fieldHashes }
}): {
  …
  forField(field): {
    …
    source, sourceLocale, isStale, translationMode,
    retranslate(): Promise<void>
  }
}
```

The hook's `retranslate` method on the per-field accessor handles
event-log emission and runner invocation; the block just calls it.

**Decision: (η2). Explicit `siblingLocale` prop; per-field accessor
extensions.**

### Q12 — Phase 1 event log shape

What gets appended to the new translation's `aiEvents` on Phase 1
"Accept all & save draft"?

Options offered:

- (ε1) One `ingested` event capturing the operation. Per-field
  provenance recorded in `canonicalFieldHashes` and AI Trace (via
  traceId).
- (ε2) One `ingested` + N `accepted` events (one per field).
- (ε3) One specialized `translated` aggregate event with N field
  hashes embedded.

Recommended (ε1). Discussed:

- Phase 1 is one editorial decision, not N. The bulk-accept doesn't
  carry the same suppression weight as deliberate per-field accepts.
- Suppression doesn't want Phase 1 hashes — if Phase 2 refine or
  stale-refresh re-proposes a Phase-1-bulk-accepted value, that's
  fine; the editor didn't reject anything.
- `canonicalFieldHashes` handles "was-this-up-to-date" axis;
  accepted/rejected handles "was-this-blessed" axis. Two different
  axes, kept separate.
- AI Trace (ADR 0011) handles per-field LLM provenance via
  `ingested.traceId`. Audit "which AI run produced this field" is
  recoverable.
- Phase 2 operations (refine, retranslate-this-field, stale-refresh
  per-field acceptances) emit per-field events normally.

**Decision: (ε1). Phase 1 emits one `ingested` event. Phase 2
operations emit per-field events.**

### Q13 — ADR plan + migration sequence

Closing question. Three ADR moves:

1. Amend ADR 0004 (auto-apply boundary) — reframe translate clause.
2. New ADR superseding ADR 0003 (pairings) — folder-per-locale.
3. New ADR — translation flow architecture (sibling-locale source-context
   kind, per-field translation config, field-diff stale refresh, two-phase
   model, registry block).

Migration sequence:

1. Lift plan steps 1-3 first (carve substrate)
2. Add `translation` config to `FieldConfig`; update Spicemixer contracts
3. Sibling-locale source kind in `runFill`
4. `canonicalFieldHashes` machinery + update `flagTranslationsStale`/`listStaleEntries`
5. Pairings folder-per-locale migration (parallelizable)
6. `sourceSlot` + `siblingLocale` extensions to InlineFieldSuggestion + useAiSuggestions
7. Build `TranslateEntityDialog`
8. Rewire Spicemixer's translation actions (delete broken, replace correct)
9. Remove `*TranslateModal` components
10. Tests

User confirmed (a) ADR plan fine, (b) migration can be simplified because
current pairings content is demo/test material — trivial migration script
for what's worth keeping, deletion for the rest. No feature gate needed.

**Decision: ADR plan as proposed. Migration as proposed with cheap
content handling.**

## Open follow-ups

Surfaced during grilling but not blocking the plan:

1. **`localize` mode pragmatics.** The "source as reference not template"
   distinction is fuzzy until a real localize prompt is written. Worst
   case v1 uses only `translate` + `copy` actively; `localize` deferred
   until tags or similar drive the need.
2. **Phase 1 partial-fill failure modes.** If a field's LLM call fails
   mid-translation, the dialog needs to surface "5 succeeded, 1 failed
   — retry that one before saving." Block-level concern; not gating the
   architectural plan.
3. **Sibling-data freshness during long-lived Phase 2 sessions.** If
   editor lingers on the form for hours and EN sibling is edited in
   another tab, retranslate uses stale prop value. v1 accepts this; the
   `translationStaleSince` machinery surfaces the issue asynchronously.
4. **Cross-reference UX from source-locale entity.** Does the source
   form gain a "Translations of this →" widget? Surfaces existing
   translations + stale signals + "Translate to …" button. Likely yes,
   but a separate small UX task.
5. **Variants × translations.** Variant relations are within-locale per
   CONTEXT.md. Translation of a variant: is it a variant of the
   source's translation, or an independent thread? Probably the former
   (translate the variant; `variantOf` points to the translated
   parent in the target locale). Confirm during implementation.
6. **`recipeCuisine` constrained translation.** "Italian" → "Italienisch"
   is constrained to a canonical per-locale label list — needs a prompt
   that enforces the constraint, or the contract should declare it as
   a closed-enum-with-per-locale-display-labels (changing the field
   type). Defer until the translation flow lands and the issue is
   concrete.

## Cross-references

- `/docs/research/2026-05-15-content-ai-package-lift.md` — the
  package-layer brainstorming this builds on.
- `/docs/research/2026-05-15-content-ai-ui-registry.md` — the UI-layer
  brainstorming this builds on. Notably, ADR 0004's translate-clause
  wording was already flagged during that session as awkward; this
  session traced it to the broken in-place rewrite pattern.
- `/docs/plans/2026-05-16-content-ai-translation-flow.md` — the
  execution-shaped output.
- ADRs touched: ADR 0014 (new, pairings folder-per-locale, supersedes
  pairings exception in ADR 0003 and ADR 0009); ADR 0015 (new,
  translation flow architecture); ADR 0004 (amended, translate clause
  reframed).
