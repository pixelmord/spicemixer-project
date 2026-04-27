# Content Architecture: Custom Metadata + Ingredient Collection

## Context

Recipe content collection stores pure schema.org Recipe JSON-LD in `apps/website/src/content/recipes/*.json`. Strict adherence is good for SEO and verbatim ingestion of third-party recipes, but blocks the metadata needed for the site's vision: spices, spicemixes, and sauces as primary content, with full meal recipes as supporting context.

## Decisions

| Question                           | Decision | Reason                                                                                                  |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| Database?                          | No       | Astro `reference()` + file-based is sufficient. Git-friendly. Revisit if editorial workflow demands it. |
| Augment JSON-LD inline?            | No       | Pollutes canonical files; custom keys clutter JSON-LD.                                                  |
| Wrapper envelope `{recipe, meta}`? | No       | Breaks drop-in third-party JSON-LD ingestion.                                                           |
| Sidecar `.meta.json`?              | Yes      | Pure JSON-LD stays portable; custom data lives separately.                                              |
| Multiple collections?              | Yes      | Structural separation (spicemixes/sauces/recipes) makes routing + nav fall out naturally.               |

## Collections

| Collection    | Purpose           | Base path                  | Schema                    |
| ------------- | ----------------- | -------------------------- | ------------------------- |
| `recipes`     | Full meal recipes | `src/content/recipes/`     | schema.org Recipe JSON-LD |
| `spicemixes`  | Spice blends      | `src/content/spicemixes/`  | schema.org Recipe JSON-LD |
| `sauces`      | Sauces, chutneys  | `src/content/sauces/`      | schema.org Recipe JSON-LD |
| `meta`        | Sidecar metadata  | `src/content/meta/{kind}/` | Custom Zod schema         |
| `ingredients` | Ingredient pages  | `src/content/ingredients/` | Custom Zod schema         |

### Meta sidecar schema (`src/content/meta/{kind}/{slug}.json`)

```jsonc
{
  "kind": "spicemix",
  "variantOf": "ras-el-hanout-classic",
  "variants": ["ras-el-hanout-fiery"],
  "goesWellWith": [{ "collection": "sauces", "slug": "harissa" }],
  "usesBase": [{ "collection": "spicemixes", "slug": "garam-masala" }],
  "ingredientLinks": [
    { "pattern": "cardamom pods, seeds only", "slug": "cardamom" },
    { "pattern": "cardamom", "slug": "cardamom" },
  ],
  "externalSources": [{ "url": "...", "title": "...", "source": "Serious Eats" }],
  "tags": ["weeknight", "make-ahead"],
}
```

`ingredientLinks` is **explicit** (not auto-detected) — robust, author-controlled. Order matters: longer patterns first to avoid substring shadowing.

### Ingredient schema (`src/content/ingredients/{slug}.json`)

```jsonc
{
  "name": "Saffron",
  "summary": "...",
  "description": "...",
  "image": "...",
  "category": "spice",
  "origin": ["Iran", "Spain"],
  "flavorNotes": ["floral", "honeyed"],
  "pairings": [{ "slug": "cardamom", "note": "..." }],
}
```

`usedIn` is **computed at build time** — not authored. Pages call `getUsedIn(slug)` which scans all meta files.

## Linking pipeline

All happens at build time in `src/lib/recipe-augment.ts`:

- `getMeta(kind, slug)` — loads sidecar, returns `EMPTY_META` if absent
- `linkIngredients(ingredients, links)` — annotates each ingredient string with a slug if matched
- `annotateTextHtml(text, links)` — replaces matched substrings with `<a>` tags; returns HTML string for `set:html`
- `resolveRefs(refs, prefix)` — resolves `{collection, slug}` refs to `{name, href}` for display
- `getUsedIn(slug, prefix)` — scans all meta files for `ingredientLinks` containing a given ingredient slug

## Trade-offs

- **Two files per recipe** — sidecar is optional; absent file = empty meta. Third-party JSON-LD remains drop-in.
- **Manual ingredient linking** — patterns maintained per recipe. Auto-detection on `recipeIngredient` strings is fragile (substring false-positives like "salt" in "salted").
- **Spicemix/sauce as Recipe JSON-LD** — semantically valid per schema.org; reuses all existing code. Revisit if SEO penalises non-meal recipes.

## Verification

1. `vp install` + `vp check` — Zod schema + build-time `getEntry` validate all cross-references.
2. Visit `/ingredients/saffron` — renders with pairings, usedIn populated.
3. Visit `/spicemixes/ras-el-hanout` — ingredient links, goesWellWith, externalSources render.
4. Visit `/recipes/preserved-lemon-couscous` — unchanged; sidecar meta loads quietly.
5. Drop raw third-party Recipe JSON in `src/content/recipes/` with no sidecar — renders without error.
6. `vp build` — full build succeeds.
7. View source: JSON-LD `<script>` contains only schema.org fields.

## Out of scope

- Search/filter UX across new sections — FilterBar extension deferred
- Image pipeline / CMS — external URLs for now
- Ingredient pairing graph visualisation
- Bulk third-party import tooling
