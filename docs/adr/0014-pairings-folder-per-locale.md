# Pairings folder-per-locale (supersedes pairings exception in ADR 0003 and ADR 0009)

Pairings move to `<collection>/<locale>/<id>.json` +
`<collection>/<locale>/<id>.meta.json`, matching the folder-per-locale
layout ADR 0009 established for ingredients, recipes, and mixtures.
The inline `descriptions: { en, de }` shape collapses to a single
`description: string` per record. Each locale is now a separate
record with its own editorial state, AI event log, and per-locale
field divergence.

This supersedes:

- the **pairings exception clause** in ADR 0003 ("Pairings keep their
  inline locale-keyed `descriptions: { en, de }` pattern as a
  documented exception"); and
- the **pairings exception clause** in ADR 0009 ("Pairings remain the
  documented ADR 0003 exception with a single file carrying inline
  `descriptions: { en, de }`").

The rest of ADR 0003 and ADR 0009 stand. The `pairings` collection
joins the uniform locale-storage rule those ADRs locked for other
kinds.

## Why this ADR exists

The 2026-05-16 translation-flow grilling session
(`/docs/research/2026-05-16-content-ai-translation-flow.md`) walked
the design of translation as a `runFill` operation on the lifted
content-ai substrate. Pairings' inline `descriptions` shape forced a
choice: either carve a third translation pattern (within-record slot
fill) alongside cross-record translation for the other kinds, or
unify by migrating pairings to folder-per-locale.

The unification case turned out to be strong on its own merits — not
just for the translation flow. The inline shape was justified
originally (ADR 0003) by the "one short paragraph per locale" payload
size and the ceremony cost of splitting a small field into two files.
Two grilling sessions of editorial workflow work have made the costs
visible.

## The costs of the inline shape (user's framing from the grilling)

> I would have never made the decision to have the translations for
> pairing live in a translation-keyed field. Yes it is economical
> because if you only have one field that is translatable it feels
> like overkill to save two records of such a small entity. But you
> pay with the cost of maintaining two variants of saving
> translations, two variants of presenting a diff, and you lose the
> ability to have a separate editorial history of the two records and
> to separate aiEvents for the translated entity record. And often
> translation has also a localization aspect — imagine we add tags to
> pairings and then the editor might use different tags for the
> localized entity.

Five distinct costs:

1. **Two storage shapes.** Editorial code paths, persistence
   adapters, sidecar loaders, save invariants all carry the inline
   shape as a permanent special case.
2. **Two diff UIs.** `PairingDiff` and `RecipeDiff` / `IngredientDiff`
   diverge for unrelated reasons; the locale-handling forks compress
   neither when both have to be kept.
3. **No separate editorial history per locale.** The DE description
   and EN description share one meta sidecar — one `draft` flag, one
   `aiEvents` log, one completeness state. The DE editor can't see
   "what AI runs produced this DE description" distinct from the EN
   history.
4. **No separate aiEvents per locale.** ADR 0004's per-entity event
   log doesn't differentiate locales when the entity carries multiple.
   Suppression, dedup, and audit conflate.
5. **No per-locale field divergence.** Pairings today have only
   `description` to translate. The moment a second translatable field
   joins (tags, region commentary, per-locale citations), the inline
   shape forces either schema gymnastics
   (`tags: { en: [...], de: [...] }`) or an awkward "some fields
   inline, some fields parallel" split.

The aggregate of these costs is permanent overhead in the substrate;
the migration cost is one-time and (per the explicit user
confirmation) cheap because current pairings content is demo / test
material.

## Locked: folder-per-locale, content and meta

Pairings storage layout:

```
apps/website/src/content/pairings/<locale>/<id>.json
apps/website/src/content/pairings/<locale>/<id>.meta.json
```

- One pair of files per pairing per locale.
- Pairing id remains `<slug-a>--<slug-b>` (alphabetically sorted),
  shared across locales because endpoint ingredient slugs are shared
  across locales (per ADR 0003's slug convention and the per-entry
  canonical-locale rule).
- `descriptions: { en, de }` collapses to `description: string` on
  the content schema.
- Meta sidecar follows the same shape used by ingredient / recipe /
  mixture meta: `canonicalLocale`, `translationStaleSince`,
  `translationOf`, `draft`, `aiEvents[]`, plus
  `canonicalFieldHashes` (added by ADR 0015 for field-diff-aware
  stale refresh).
- The save invariant from ADR 0009 ("locale is mandatory at save
  time") applies to pairings now too.

## Why the original ADR 0003 exception no longer carries

The exception was justified by:

- "A single `description` field per locale is low-volume enough that
  B's locale-keyed pattern is appropriate" — true in 2026-05-02 when
  pairing meta was nearly empty. False now that meta needs
  per-locale `aiEvents`, `canonicalFieldHashes`, `draft`,
  `translationStaleSince`, etc.
- "Splitting one short paragraph per pairing into a separate file
  per locale would be ceremony without payoff" — the payoff is now
  visible (uniform substrate, per-locale editorial state,
  future-field-divergence headroom). The ceremony cost is one extra
  file pair per pairing per locale, which the filesystem and Astro
  loader handle uniformly with every other collection.

The exception was defensible at decision time given the information
available; two sessions of editorial workflow design have surfaced
the costs that weren't visible then.

## Migration

Cheap because the existing pairings content is demo/test material.

1. **Audit existing pairings.** Identify which records are worth
   migrating versus deletable. The grilling confirmed deletion is an
   acceptable simplification for non-worth-keeping demo entries.
2. **One-shot migration script.** For each retained pairing
   `pairings/<id>.json` with `descriptions: { en, de }`:
   - Write `pairings/en/<id>.json` with `description:
descriptions.en` (if present); same for `de`.
   - Write `pairings/en/<id>.meta.json` and
     `pairings/de/<id>.meta.json`, each with `canonicalLocale` set
     to whichever locale was the original canonical (or both pointing
     at the same canonical, with `translationOf` on the non-canonical
     one).
   - Delete the original flat `pairings/<id>.json` and `.meta.json`.
3. **Schema update.** `pairingSchema` drops the
   `descriptions: { en, de }` field and gains `description: string`.
   The pairing endpoint reference shape (id composed from sorted
   slugs) is unchanged in form, but the endpoint reference type
   itself widens under ADR 0016 — `ingredients: tuple<string, string>`
   becomes `endpoints: tuple<endpointRef, endpointRef>` over
   ingredients+mixtures+recipes, and `featured: boolean` joins the
   meta sidecar. The folder-per-locale rev and the endpoint-widening
   rev land as one schema change, since both packages and the AI
   contract for Pairing are touched anyway.
4. **Public-site read-path update.** The pairing detail page resolves
   missing-locale-translation via the same `translationOf` + fallback
   banner pattern other kinds use (ADR 0003's locked semantics).
5. **Search index update.** Pagefind per-locale index now includes
   pairings under each locale folder.
6. **AdminUI update.** Pairing list / editor pages route through the
   same locale-aware patterns as other kinds.
7. The `pairingMeta` type collapses into the shared meta sidecar
   shape used by other kinds (the open follow-up from ADR 0009 about
   `pairingMeta` divergence is resolved by this ADR).

Idempotent. Reversible if needed (the inline shape can be
reconstructed from per-locale records, though we don't anticipate
the need).

## Alternatives rejected

- **Keep the inline exception; carve a third translation pattern**
  (within-record slot fill) on the AI runner. Considered during the
  translation-flow grilling. Rejected because it doubles substrate
  surface (third dispatch path on the runner) and locks in the four
  costs above permanently.
- **Compromise: pairings content stays inline, meta moves to
  folder-per-locale.** Splits state from content for one kind only;
  permanent comprehension tax. Not seriously pursued.
- **Defer the migration until pairings need a second translatable
  field.** Procrastinates the substrate work; means the translation
  flow has to ship with a special-case dispatch for pairings; means
  the migration happens under future time pressure rather than now
  when content is throwaway.

## Consequences

### Code

- `pairingSchema` updates to single-locale shape.
- `pairingMeta` type collapses into the shared meta sidecar shape;
  ADR 0009's open follow-up resolves.
- `LocalFsStore` (and future `GitHubStore`) walks
  `pairings/<locale>/<id>.json` uniformly with other kinds. The
  pairing-specific list/read code paths simplify.
- `PairingTranslateModal` deletes (replaced by `TranslateEntityDialog`
  per ADR 0015).
- `aiTranslatePairing` action becomes a thin Astro shell around
  `runFill` with sibling-locale source (per ADR 0015), like the other
  translate actions.
- `PairingDiff` aligns with the per-locale shape used by
  `RecipeDiff` / `IngredientDiff`.
- Pairing routes update for locale-aware URL structure
  (`/<locale>/pairings/<id>` parallel to other kinds).

### Content

- `apps/website/src/content/pairings/<id>.json` files migrated as
  described above. Throwaway demo content deleted where not worth
  retaining.

### Documentation

- CONTEXT.md updated inline during the 2026-05-16 grilling session to
  reflect this decision (Locale storage section no longer cites
  pairings as the exception).
- ADR 0003 and ADR 0009 remain in place; their pairings-exception
  clauses are explicitly superseded by this ADR. Future readers
  encountering those clauses should find this ADR via the
  cross-reference here.

### Migration order

The pairings migration can run in parallel with the broader
content-ai translation work (per ADR 0015's migration sequence).
Steps 1-5 of this migration are independent of the runner
implementation; steps 6-7 follow naturally.

## Reference

Decided in the 2026-05-16 translation-flow grilling session
(`/docs/research/2026-05-16-content-ai-translation-flow.md`, Q2).
Companion to ADR 0015, which depends on this convergence to keep the
translation runner single-shaped across all EntityKinds.
