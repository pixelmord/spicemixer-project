# EN/DE routing: shared page components via Astro.currentLocale

Duplicate `de/` pages (index, ingredients/[slug], recipes/[slug], mixtures/[slug]) are
eliminated by extracting rendering logic into shared Astro components in
`src/components/pages/`. Route files in both `pages/` and `pages/de/` become thin
wrappers: they contain only `getStaticPaths` (locale-specific) and a single component
delegation. Locale detection inside shared components uses `Astro.currentLocale`, which
Astro's i18n routing resolves correctly for both `en` (no prefix) and `de` (prefix)
routes.

## Options considered

1. **Astro built-in i18n routing with single page files** — Would require significant
   routing config changes and cannot generate `/de/` paths from a single root page with
   static output. Rejected: too disruptive to existing URL structure.

2. **Shared layout component + thin route wrappers (chosen)** — Extract rendering into
   `src/components/pages/*.astro`. Each component uses `Astro.currentLocale ?? "en"` for
   locale detection. Route files retain locale-specific `getStaticPaths`. This is a safe,
   incremental change that preserves all URLs and fallback-banner/hreflang behaviour.

3. **Explicit shared partials (status quo with extracted pieces)** — Partial dedup without
   full elimination. Rejected: still leaves clone groups detectable by fallow.

## Consequences

- `src/components/pages/IngredientSlugPage.astro`, `RecipeSlugPage.astro`,
  `MixtureSlugPage.astro`, `HomePage.astro` are the canonical rendering sources.
- Route files (`pages/[entity]/[slug].astro` and `pages/de/[entity]/[slug].astro`) are
  authoritative only for `getStaticPaths` and the locale passed to `resolvePublished`.
- Tests that previously checked page file content now check the shared component.
- `Astro.currentLocale` is confirmed to resolve correctly inside non-page `.astro`
  components (already used by `RecipeMeta.astro`, `SiteNav.astro`, etc.).
- Translation keys for ingredient long-form section labels (`ingredient.section.*`,
  `ingredient.sources`, `ingredient.liability`) added to `translations.ts` to avoid
  hardcoded locale strings in components.

## Reference

Implements issue #60 (locale routing dedup). Decided by inspection: the root pages already
used `Astro.currentLocale` and the Astro i18n config (`prefixDefaultLocale: false`) was
already in place. Decision deferred from issue #59.
