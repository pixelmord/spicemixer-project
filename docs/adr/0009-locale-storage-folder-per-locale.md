# Locale storage: folder-per-locale across all collections, locale required at save

All locale-bearing collections store entries (and their meta sidecars)
in `<locale>/<slug>.json` and `<locale>/<slug>.meta.json` form. The
folder is the locale carrier. This extends ADR 0003's locked
folder-per-locale pattern from ingredients to recipes and mixtures,
which today are flat with locale encoded in a `language` field. Meta
sidecars follow the same shape — no filename-suffix variant. Pairings
remain the documented ADR 0003 exception with a single file carrying
inline `descriptions: { en, de }`.

A second, equally load-bearing invariant: **no entry is ever written
to disk without a determined locale.** The save path rejects writes
with empty or missing locale; locale comes from explicit user choice
or the auto-applied AI language-detection output (ADR 0004 allowlist).

## Why this ADR exists

The 2026-05-04 architecture-improvement session noted asymmetry
between ingredient meta storage (locale-keyed inside one file) and
recipe / mixture / pairing meta storage. An earlier draft of this
ADR proposed converging on filename-suffix
(`<slug>.<locale>.meta.json`), assuming recipe / mixture meta were
already parallel-per-locale. Inspection of the live content tree
revealed three patterns, not two:

| Collection  | Content (pre-ADR)      | Meta (pre-ADR)                                      | Locale carrier                    |
| ----------- | ---------------------- | --------------------------------------------------- | --------------------------------- |
| ingredients | `<locale>/<slug>.json` | `<locale>/<slug>.meta.json` (canonical-locale only) | folder                            |
| recipes     | `<slug>.json` (flat)   | `<slug>.meta.json` (flat)                           | `language` field                  |
| mixtures    | `<slug>.json` (flat)   | `<slug>.meta.json` (flat)                           | `language` field                  |
| pairings    | `<slug>.json` (flat)   | `<slug>.meta.json` (flat)                           | inline `descriptions: { en, de }` |

The earlier draft would have flipped ingredients into the flat shape
to match recipes/mixtures. That direction was wrong: ADR 0003 had
already locked folder-per-locale for content, and ingredients were
the only collection respecting it. Convergence should pull
recipes/mixtures **toward** ingredients, not the other way.

## Locked: folder-per-locale, content and meta

For ingredients, mixtures, and recipes:

- `apps/website/src/content/<collection>/<locale>/<slug>.json` —
  content.
- `apps/website/src/content/<collection>/<locale>/<slug>.meta.json` —
  meta sidecar.
- One pair of files per entry per locale.
- Same `canonicalLocale` and `translationStaleSince` semantics from
  ADR 0003 — meta carries them just like content.

For pairings:

- The pairings content keeps inline locale-keyed
  `descriptions: { en, de }` (ADR 0003 exception). The pairing meta
  also stays single-file, since the meta payload per pairing is small
  and inseparable from the dual-locale content pattern.
- Pairings stay flat at `apps/website/src/content/pairings/<slug>.json`
  (no locale folder).
- Justification: pairings are a single short paragraph per locale;
  splitting one short field into a file per locale would be ceremony
  without payoff. Same logic ADR 0003 cited.

## Why folder, not filename-suffix

Both shapes deliver consistency between content and meta. The
filename-suffix alternative (`<slug>.<locale>.json`) was considered
and rejected for these reasons:

- **ADR 0003 already locked folder-per-locale for content.**
  Filename-suffix would have required re-opening that decision and
  migrating ingredients out of the folder shape they already use.
  Folder-per-locale extends an existing lock instead.
- **Smaller migration.** Folder-per-locale moves recipes / mixtures
  into `en/` subfolders (about half the content). Filename-suffix
  would have moved every locale-folder file in ingredients, plus
  renamed every flat file in recipes/mixtures.
- **Astro convention alignment.** Astro's i18n routing examples and
  content-collection examples lean folder-per-locale. The custom
  id-derivation needed for the loader is the same complexity in both
  shapes, but folder-per-locale aligns with documented patterns.
- **The "single `ls` shows all files for one entry" argument cuts
  both ways.** With many entries, flat directories become noisy
  (entries × locales × `.json + .meta.json`). Folder-per-locale
  groups by access pattern editors actually use ("show me the EN
  catalog," "show me what's translated to DE").

## Save invariant: locale is mandatory

Every write to a locale-bearing collection (ingredients, recipes,
mixtures) carries a determined non-empty locale before any disk
contact. This is a hard invariant, not a validation that can be
bypassed.

### Where locale comes from

- **User-set, explicit.** The form's locale picker is a required
  field on new-entry creation. The Save action does not enable
  until the picker has a value.
- **Auto-applied by AI language detection.** ADR 0004's auto-apply
  allowlist already permits language-detection auto-apply (high
  confidence, reversible, bounded, verifiable). For NEW entries
  authored from imported / pasted content, language detection runs
  before save and writes the result into the meta sidecar's
  `language` / `canonicalLocale` field. The editor sees the value
  and can override before submitting.

For UPDATES of an existing entry, locale is **immutable** — pulled
from the existing meta sidecar, never re-prompted. A locale change
on existing content is a translation operation, not an edit, and
goes through the translation flow (separate `translationOf`
relationship, separate file in another locale folder).

### Where the invariant is enforced

- **Form layer:** `useEntityFormState(kind, ...)` (the EntityKind
  seam hook from ADR 0008) refuses to construct a save payload
  without a locale. The Save button is disabled when locale is
  empty on a new entry.
- **Action layer:** the AI orchestration runner and the save action
  reject empty / missing locale before invoking `ContentStore.put`.
- **Type layer (preferred):** the save payload type carries
  `locale: Locale` (not `locale?: string | null`). The path
  construction `<collection>/<locale>/<slug>.json` becomes
  unconstructable from a payload without a locale.

The invariant exists because folder-per-locale storage makes the
failure mode of "save without locale" silently catastrophic — a
write to `<collection>/undefined/<slug>.json` or
`<collection>//<slug>.json` (empty path segment) corrupts the
content tree in ways that don't surface until build time or
detail-page render.

## Migration

Issue #63 ships the migration:

1. Move `apps/website/src/content/recipes/<slug>.json` →
   `recipes/en/<slug>.json` (locale read from the existing
   `language` field, defaulting to `en` only where the field is
   absent and content is unambiguously English).
2. Move `recipes/<slug>.meta.json` → `recipes/en/<slug>.meta.json`
   the same way.
3. Same migration for `mixtures/`.
4. Ingredient meta sidecars stay where they are (already
   folder-per-locale). Where a translation exists in `de/<slug>.json`
   without a corresponding `de/<slug>.meta.json`, create the empty
   meta file with `canonicalLocale` pointing at the source locale and
   `translationStaleSince` unset (translations inherit the canonical
   meta state at migration time).
5. Pairings untouched.
6. The `language` field on recipe/mixture content can be removed
   post-migration (locale is now the folder, not a field). Defer
   removal: keep the field as a redundant convenience for one
   release cycle so external readers don't break, then remove in a
   follow-up.
7. Astro content-collection loader updated with a `generateId` that
   derives `id` from `<locale>/<slug>` and surfaces locale on the
   collection entry.
8. Migration script is idempotent and reversible.
9. Save-invariant enforcement (form layer + action layer + types)
   ships in the same PR as the migration. Without it, the
   post-migration tree is reachable but writes are unsafe.

## Alternatives rejected

- **Filename-suffix everywhere
  (`<slug>.<locale>.json`).** Re-opens ADR 0003's content layout
  decision. Larger migration. Diverges from Astro conventions.
  Considered seriously and ruled out — see "Why folder, not
  filename-suffix" above.
- **Mixed: content folder-per-locale, meta filename-suffix.** The
  earlier draft of this ADR. Inconsistency between content and meta
  shapes for the same entry. No principled justification once
  examined.
- **Status quo (three patterns).** Forces the EntityKind seam
  (ADR 0008) to carry a permanent per-kind `metaSidecarShape` field,
  forces every locale-aware code path to branch on collection.
  Permanent comprehension tax to avoid a one-time migration.
- **Locale optional at save (default to EN).** A silent default is a
  bug magnet — recipe imports without language hints would
  catastrophically write to the wrong locale's tree. Hard rejection
  is the only safe behaviour.
- **Locale prompted at save time as a confirmation modal.** Adds
  friction to the auto-apply flow ADR 0004 was designed to enable.
  The form picker plus auto-applied detection covers both flows
  without additional ceremony.

## Consequences

### Code

- `LocalFsStore` and the future `GitHubStore` walk
  `<collection>/<locale>/<slug>.json` uniformly. The
  collection-specific `list()` filtering for ingredient meta goes
  away.
- `MetaRef` (`{ collection, locale, slug }`) drops any conditional
  locale handling. The two `MetaRef` definitions flagged by fallow
  (`meta-sidecar.ts:9` and `recipe-augment.ts:16`) converge on a
  single shape with locale always required.
- The save-invariant lives in three places: form-layer (button
  guard + payload constructor), action-layer (handler validation),
  type-layer (non-optional `locale` on save payloads).
- `useEntityFormState(kind, ...)` from ADR 0008 contracts a
  required `locale` at construction; new-entry mode triggers the
  language-detection auto-apply on first text input, persisting the
  result into form state before save becomes available.
- The transitional `metaSidecarShape` field on the EntityKind
  registry (ADR 0008) is removed.
- `AiEventLog` (issue #62) reads and writes a single sidecar shape
  regardless of kind.

### Documentation

- CONTEXT.md updated to note that all locale-bearing collections use
  folder-per-locale for both content and meta, with pairings as the
  documented exception.
- ADR 0003's "parallel files per locale" decision now applies to
  meta as well as content. ADR 0003 itself is unchanged; this ADR
  extends its scope.

### Open follow-ups

- The redundant `language` field on recipe/mixture content can be
  removed one release after the migration lands. Tracked separately.
- Whether `pairingMeta` continues to need its own type or collapses
  into `mixtureMeta` / `recipeMeta` once the meta shape is uniform.
  Defer until issues #62 and #63 land and the post-migration shape
  stabilises.
- Romanization for non-Latin script slugs (deferred per ADR 0003)
  is unaffected by this decision.

## Reference

Decided in the 2026-05-04 architecture-improvement grilling session,
revised in the same session after the user challenged the
filename-suffix direction with a layout-inspection counterargument
plus the locale-required save invariant. Implemented by issue #63.
Companion to ADR 0008 (EntityKind seam), which depends on this
convergence.
