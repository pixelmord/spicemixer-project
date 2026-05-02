# Per-entry canonical locale, parallel files, stale-flag sync

Each content entry has its **own** canonical locale, set on first save
to whichever locale was authored first. There is no global
EN-canonical assumption. Translations declare `translationOf: <slug>`
and stamp `translationStaleSince: <iso-date>` when the canonical
entry's content changes — they are never auto-published, never
auto-translated.

Storage uses **parallel files per locale**, one file per entry per
locale, matching Astro content-collection conventions. Pairings keep
their inline locale-keyed `descriptions: { en, de }` pattern as a
documented exception.

## Why per-entry canonical (not EN-canonical)

The earlier draft of this decision proposed "EN is canonical" — the
editor authors EN first, then translates. The user pushed back: editors
and ingestion pipelines will produce content in whatever locale is
natural, and forcing EN-first adds friction that the project doesn't
want to inherit.

**Locked: per-entry canonical locale.** Each entry's meta sidecar
carries `canonicalLocale: <code>` set on first save — whichever locale
was authored first wins. Stale-flagging and the suggested-source
direction follow that per-entry choice.

The implication for SEO and catalog completeness — a partly-DE,
partly-EN canonical mix — is acknowledged and addressed editorially
(translation parity targets before Phase 2), not via schema
constraint.

## Why parallel files (not single file with locale-keyed values)

Three options were on the table:

- **A** — parallel files per locale (current ingredient pattern).
- **B** — single file, locale-keyed fields (current pairing pattern).
- **C** — hybrid: language-neutral base file + per-locale overlay.

**Locked: A.** Reasons:

- Astro content collections expect file-per-entry; A is the path of
  least friction.
- C's "language-neutral" line is thinner than it looks. Cultural
  localization legitimately edits structurally-similar fields:
  `commonNames` differs across locales, `origin` may be reordered for
  cultural relevance, `flavorNotes` gets reworded in voice. The
  duplication savings don't justify the loader-and-admin complexity.
- Drift between locales is real but addressable through tooling
  (stale-flagging) rather than schema enforcement.

**Pairings remain the exception.** A single `description` field per
locale is low-volume enough that B's locale-keyed pattern is
appropriate; splitting one short paragraph per pairing into a separate
file per locale would be ceremony without payoff. CONTEXT.md
documents this as an exception.

## Sync model

- **Independent edit + stale-flag.** When the canonical entry's
  content hash changes, all `translationOf` children get
  `translationStaleSince: <iso-date>` stamped in their meta
  sidecar. Admin surfaces a "needs review" list.
- **No auto-translate.** AI offers a candidate when the editor opens
  the stale entry — never auto-publishes a re-translation. (See
  ADR 0004 for the full auto-apply boundary.)
- **Independent edits stand.** Editors can modify a translation
  without touching the canonical; the stale flag is purely a hint.

## Translation semantics

Localize, not just reword. Locales can:

- Use locally-meaningful example dishes ("good in Sunday roast" → "passt
  zum Sonntagsbraten" with a German cuisine reference).
- Reorder `origin` by cultural relevance.
- Adjust `commonNames` to that culture's vernacular.
- Cite locale-specific sources.

Locales **cannot** contradict canonical facts: botanical name, family,
safety flags, allergen markers. Editorial guidance, not schema
enforcement.

## Slug convention

English-derived where reasonable (URL stability across the catalog
regardless of which locale was authored first). Editorial guidance,
not schema enforcement. DE-first authoring works fine; the editor
provides an English-form slug. Romanization story for non-Latin
scripts is deferred.

## Detail-page fallback

When a reader requests an entry in a locale that doesn't exist, the
detail page renders the canonical-locale content with a banner:
_"This is the original [locale] entry; an [other-locale] translation
is pending."_ Editor and AI fill in over time.

## Locale scope

- **Phase 1 active set:** EN + DE.
- **Schema:** `z.string().length(2)` — not locale-restricted at the
  schema layer. Active set is gated by admin and build configs.
- **Phase 2:** third locale (FR, IT, ES, …) enters via the matured
  translation pipeline, not parallel hand-authoring.

## Consequences

- All meta sidecar schemas (`recipeMeta` / `mixtureMeta`,
  `ingredientMeta`, `pairingMeta`-equivalent) gain `canonicalLocale`
  and `translationStaleSince` fields.
- Existing parallel-file content acquires `canonicalLocale` on
  next save (default to whichever locale matches the file's
  folder).
- A content-hash watcher must run on canonical-side saves to stamp
  staleness on translations.
- The admin "needs review" surface becomes a routine editorial
  workflow.
- Routing must handle missing-translation fallback with the banner
  pattern uniformly across ingredient, mixture, and recipe detail
  pages.
- SEO `hreflang` tags must reflect per-entry canonical state.

## Reference

Decided in the 2026-05-02 continued session. Full discussion:
`docs/research/2026-05-02-content-model-continued.md`, section Q7.
