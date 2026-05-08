# EN/DE routing: shared page components via Astro.currentLocale

Duplicate pages between `pages/` and `pages/de/` are eliminated by extracting rendering
into shared Astro components in `src/components/pages/`. Route files in both trees become
thin wrappers — `getStaticPaths` only (delegated to a locale-parameterized factory), then a
single component delegation. Locale detection inside shared components uses
`Astro.currentLocale`, which Astro's i18n routing resolves correctly for both `en` (no
prefix) and `de` (prefix) routes.

The pattern applies **universally** to every page that exists in both trees — detail pages,
index pages, and singletons like `search.astro`. Threshold-based dedup ("only pages above
N lines") was rejected: the structural rule is auditable; a judgement call invites "I'll
just inline this small change in DE" cheating that recreates the original duplication.

## Options considered

1. **Astro built-in i18n routing with single page files** — A `pages/[...lang]/...` rest-param
   route can technically generate both `/foo/` and `/de/foo/` from one file. Rejected as a
   bigger refactor than the duplication is worth: hreflang machinery, fallback-banner
   plumbing, and `getStaticPaths` shapes already exist per-locale; merging them across four
   entity types introduces gotchas (trailing slash, undefined-param dev-mode 404s) that
   trade one structural concern for another.

2. **Shared layout component + thin route wrappers (chosen)** — Extract rendering into
   `src/components/pages/*.astro`. Each component derives locale from `Astro.currentLocale`.
   Route files retain locale-specific `getStaticPaths` via a shared factory. Safe,
   incremental, preserves all URLs and fallback-banner / hreflang behaviour.

3. **Explicit shared partials (status quo with extracted pieces)** — Partial dedup without
   full elimination. Rejected: still leaves clone groups detectable by fallow.

## Locale resolution inside shared components

Astro i18n is configured with `prefixDefaultLocale: false` and `locales: ["en", "de"]`.
`Astro.currentLocale` is authoritatively populated for every routed page; the `?? "en"`
fallback used in the initial implementation is dead code that hides routing misconfiguration.

**Locked:** `const locale = Astro.currentLocale as Lang`. No fallback.

ADR 0009 makes locale-less storage a hard invariant precisely because silent locale
defaults are bug magnets. Rendering follows the same discipline — a silent default at
render time would mask routing bugs that ADR 0009's storage check no longer catches (the
file already exists, locale-correct on disk; only the render side could lie about it).

## Static paths: factory functions

Wrappers under `pages/` and `pages/de/` cannot collapse into a single file (Astro's static
build needs distinct route entrypoints), but their `getStaticPaths` is mechanically
locale-parameterized. Each wrapper imports a factory:

```ts
// lib/static-paths/mixture-slug-paths.ts
export async function mixtureSlugPaths(locale: Lang) {
  /* per-locale path computation */
}

// pages/mixtures/[slug].astro
export const getStaticPaths = () => mixtureSlugPaths("en");

// pages/de/mixtures/[slug].astro
export const getStaticPaths = () => mixtureSlugPaths("de");
```

Wrapper boilerplate drops to ~6 lines: import factory, declare `getStaticPaths`, render
shared component with `Astro.props` spread.

## Migration plan (issue #59)

Single PR. Pages in scope:

| Wrapper pair                                 | Shared component                  | Path factory               |
| -------------------------------------------- | --------------------------------- | -------------------------- |
| `pages/index.astro` ↔ `pages/de/index.astro` | `HomePage.astro` ✅               | n/a (no static params)     |
| `pages/ingredients/[slug].astro` ↔ `de/...`  | `IngredientSlugPage.astro` ✅     | `ingredient-slug-paths.ts` |
| `pages/recipes/[slug].astro` ↔ `de/...`      | `RecipeSlugPage.astro` ✅         | `recipe-slug-paths.ts`     |
| `pages/mixtures/[slug].astro` ↔ `de/...`     | `MixtureSlugPage.astro` ✅        | `mixture-slug-paths.ts`    |
| `pages/search.astro` ↔ `de/search.astro`     | `SearchPage.astro` (new)          | n/a                        |
| `pages/ingredients/index.astro` ↔ `de/...`   | `IngredientIndexPage.astro` (new) | n/a                        |
| `pages/recipes/index.astro` ↔ `de/...`       | `RecipeIndexPage.astro` (new)     | n/a                        |
| `pages/mixtures/index.astro` ↔ `de/...`      | `MixtureIndexPage.astro` (new)    | n/a                        |
| `pages/pairings/index.astro` ↔ `de/...`      | `PairingIndexPage.astro` (new)    | n/a                        |
| `pages/pairings/[slug].astro` ↔ `de/...`     | `PairingSlugPage.astro` (new)     | `pairing-slug-paths.ts`    |

Existing components keep their behaviour; the dead `?? "en"` fallback is removed in the
same PR. The `getStaticPaths` bodies in already-thin wrappers move into factories.

Pairings carry inline `descriptions: { en, de }` (ADR 0009 exception). Inside
`PairingSlugPage`, the cross-locale fallback is `pairing.descriptions?.[locale] ??
pairing.descriptions?.[otherLocale] ?? ""` — trivially handled, not a structural concern.

`pages/admin/*` and `pages/preview/...` are out of scope (no DE twin exists).

## Verification

- `vp check` passes (type breakage from `as Lang` casts surfaces here).
- Build-diff is the no-regression signal:
  ```sh
  git stash && vp build && mv dist dist-main && git stash pop && vp build && diff -r dist-main dist
  ```
  Empty (or whitespace-only) diff against `main` is conclusive for a static-output site.
- Dev-server smoke: one detail page per entity per locale, all index pages, search page.

## Rollback

Single PR. Rollback = revert the PR. No content migration, no schema change, no
irreversible step. The previous duplicated tree is byte-recoverable from git history.

## Consequences

- Canonical rendering sources live in `src/components/pages/*.astro`; route files are
  authoritative only for `getStaticPaths` (via factories) and the locale passed implicitly
  through Astro's routing.
- The two `pages/` trees stay parallel by file count, but each pair of wrappers is now ~6
  lines mirroring its sibling — mechanical, not editable in divergence-prone ways.
- `Astro.currentLocale` is confirmed to resolve correctly inside non-page `.astro`
  components (already used by `RecipeMeta.astro`, `SiteNav.astro`, etc.).
- Translation keys for shared-component labels (e.g. ingredient long-form sections,
  filter / nav strings, search page strings) live in `translations.ts` so no hardcoded
  locale strings appear in components.
- Hreflang and `TranslationFallbackBanner` machinery (issue #49 area, ADR 0003) is
  preserved unchanged — both already work from `Astro.currentLocale` and `canonicalLocale`
  on the entity, neither of which the refactor touches.

## Reference

Decided originally for the four detail pages flagged by fallow (issue #60 implementation).
Extended on 2026-05-08 to cover all DE-twinned pages (search, indexes, pairings) after a
grilling session against issue #59's "decide EN/DE routing strategy" scope. The original
rejection of the rest-param-route option remains; the rejection rationale is sharpened
(migration cost, not technical infeasibility).
