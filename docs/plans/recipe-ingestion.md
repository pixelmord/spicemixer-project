# Plan: `packages/recipe-ingestion` — third-party recipe ingestion

## Context

The website currently consumes hand-authored schema.org Recipe JSON-LD from `apps/website/src/content/{recipes,spicemixes,sauces}/*.json`, validated by Zod in `apps/website/src/content.config.ts`. To grow the catalog, we want a future server handler (or build-time script) to **import recipes from third-party URLs**: fetch the page, locate the Recipe JSON-LD, normalize the schema.org union variants into a stable shape, and produce JSON that drops cleanly into the existing content collections.

A mature Python reference exists at `resources/recipe-scrapers` (MIT). We will not port the 600-domain scraper registry — only the JSON-LD extraction + normalization core, the duration/yield parsers, and the string-normalization helper.

The package is already **scaffolded empty** at `packages/recipe-ingestion/` from the `packages/utils` template (package name `recipe-ingestion`, `src/index.ts`, `tests/index.test.ts`, `vite.config.ts`, `tsconfig.json` already exist). This plan extends that scaffold rather than creating from scratch.

Outcome: `vp run recipe-ingestion#test` green; importing `fetchRecipe(url)` from a future server handler returns a recipe object that, when written to `src/content/recipes/<slug>.json`, passes the existing Zod schema and renders unchanged.

## Decisions (confirmed)

| Decision           | Choice                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Schema home        | New ingest package owns canonical Zod recipe schema; `apps/website/src/content.config.ts` imports it |
| Surface            | `fetchRecipe(url)` (HTTP) + `parseRecipe(html, url)` + `normalizeRecipe(raw)`                        |
| v1 scope           | JSON-LD only (no Microdata, no OpenGraph fallback, no per-domain dispatchers)                        |
| Schema attribution | MIT notice in `LICENSE` crediting recipe-scrapers contributors for ported logic                      |

## Package layout

Existing scaffold (do not recreate): `package.json` (name `recipe-ingestion`), `tsconfig.json`, `vite.config.ts`, `src/index.ts`, `tests/index.test.ts`. Replace `src/index.ts` and `tests/index.test.ts` content; add the rest.

```
packages/recipe-ingestion/
├── package.json              # bump vite-plus → ^0.1.19, add zod
├── tsconfig.json             # keep (matches packages/utils)
├── vite.config.ts            # add `test:` block (see Test setup below)
├── LICENSE                   # MIT + recipe-scrapers attribution (new)
├── README.md                 # rewrite: public API + examples
├── src/
│   ├── index.ts              # public exports (replace scaffold stub)
│   ├── schema.ts             # canonical Zod Recipe (moved from content.config.ts)
│   ├── fetch.ts              # fetchRecipe(url, opts)
│   ├── extract.ts            # extractJsonLd(html) — script tags only
│   ├── find-recipe.ts        # findRecipe(jsonLd[]) — walk @graph, mainEntity
│   ├── normalize/
│   │   ├── index.ts          # normalizeRecipe(raw, sourceUrl)
│   │   ├── image.ts          # string | ImageObject | array → string
│   │   ├── instructions.ts   # string | HowToStep | HowToSection | nested[] → HowToStep[]
│   │   ├── ingredients.ts    # string | PropertyValue | nested[] → string[]
│   │   ├── author.ts         # @id ref resolution + Person/Organization
│   │   ├── yield.ts          # string | number | QuantitativeValue → string
│   │   ├── duration.ts       # ISO-8601 normalization + range stripping
│   │   ├── keywords.ts       # CSV string | array → array (deduped)
│   │   └── nutrition.ts      # NutritionInformation passthrough
│   ├── util/
│   │   ├── strings.ts        # decodeHtml + stripTags + collapseWhitespace
│   │   ├── refs.ts           # @id lookup index across @graph
│   │   └── duration-parse.ts # accept "PT1H30M", "1h 30m", "1.5 hours" → ISO
│   └── types.ts              # Raw* JSON-LD union types + IngestResult
└── tests/
    ├── fixtures/             # captured HTML samples (allrecipes, nyt, bbcgoodfood)
    ├── extract.test.ts
    ├── normalize-image.test.ts
    ├── normalize-instructions.test.ts
    ├── normalize-ingredients.test.ts
    ├── normalize-yield.test.ts
    ├── duration-parse.test.ts
    ├── strings.test.ts
    └── integration.test.ts   # fixture HTML → IngestResult → Zod-validated
```

## Test setup (Vitest via Vite+)

Per CLAUDE.md: **never `npm install vitest` directly** — Vite+ wraps Vitest, and the bundled Vitest version is determined by the `vite-plus` version. To get the newest Vitest, bump `vite-plus`.

1. **Bump `vite-plus`** from `^0.1.14` → `^0.1.19` (current latest, confirmed via `npm view vite-plus version`) in `packages/recipe-ingestion/package.json`. Root `pnpm-workspace.yaml` may already pin it via catalog — if so, bump there and re-`vp install`.
2. **Add `test:` block** to `packages/recipe-ingestion/vite.config.ts` (Vite+ docs: keep test config in `vite.config.ts`, not a separate `vitest.config.ts`):

   ```ts
   import { defineConfig } from "vite-plus";

   export default defineConfig({
     pack: { dts: { tsgo: true }, exports: true },
     lint: { options: { typeAware: true, typeCheck: true } },
     fmt: {},
     test: {
       include: ["tests/**/*.test.ts"],
       environment: "node", // pure-Node lib, no DOM
       testTimeout: 10_000, // some fixture parses are heavier
       coverage: {
         provider: "v8",
         include: ["src/**/*.ts"],
         exclude: ["src/types.ts", "src/index.ts"],
         reporter: ["text", "html"],
       },
       globals: false, // explicit imports from vite-plus/test
     },
   });
   ```

3. **Import test utilities from `vite-plus/test`** (per CLAUDE.md — never from `vitest` directly):

   ```ts
   import { describe, expect, test, vi } from "vite-plus/test";
   ```

4. **Run** with `vp test` (one-shot), `vp test watch` (watch), or `vp test run --coverage` (with coverage). Workspace-scoped: `vp run recipe-ingestion#test`.

5. **HTTP mocking**: use `vi.stubGlobal("fetch", mockFetch)` from `vite-plus/test` for `fetchRecipe` tests so no real network calls occur. Fixture HTML lives in `tests/fixtures/*.html`, loaded via `node:fs`.

## Public API (src/index.ts)

```ts
export interface FetchOptions {
  fetch?: typeof globalThis.fetch; // injectable for tests / SSR
  headers?: Record<string, string>; // UA defaults to spicemixer-ingest/<ver>
  signal?: AbortSignal;
  timeoutMs?: number; // default 15000
}

export interface IngestResult {
  recipe: Recipe; // validated against Zod schema
  source: { url: string; canonical?: string; siteName?: string; fetchedAt: string };
  warnings: IngestWarning[]; // non-fatal: missing fields, lossy coercions
}

export interface IngestWarning {
  code: string;
  field?: string;
  message: string;
}

export class IngestError extends Error {
  code: string;
  cause?: unknown;
}
//   codes: FETCH_FAILED, NO_JSONLD, NO_RECIPE, INVALID_RECIPE, TIMEOUT

export async function fetchRecipe(url: string, opts?: FetchOptions): Promise<IngestResult>;
export function parseRecipe(html: string, url: string): IngestResult;
export function extractJsonLd(html: string): unknown[];
export function findRecipe(jsonLd: unknown[]): unknown | null;
export function normalizeRecipe(
  raw: unknown,
  sourceUrl: string,
): { recipe: Recipe; warnings: IngestWarning[] };

// Re-exports
export { recipeSchema, type Recipe } from "./schema.ts";
```

Package consumers import as:

```ts
import { fetchRecipe, recipeSchema } from "recipe-ingestion";
// or
import { recipeSchema } from "recipe-ingestion/schema"; // if a /schema subpath export is added
```

## Normalization rules (the meat)

Each maps schema.org Recipe variants → the existing Zod shape in `apps/website/src/content.config.ts:22-50`.

| Field                                 | Input variants                                   | Output                     | Logic                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                | string                                           | string                     | `normalizeString` (HTML unescape + tag strip + whitespace collapse)                                                                                                                   |
| `description`                         | string \| missing                                | string \| undefined        | normalize, drop if empty                                                                                                                                                              |
| `image`                               | string \| ImageObject \| (string\|ImageObject)[] | string \| string[]         | flatten; ImageObject → `.url`; absolute http(s) only; if array of 1 → string; if `best_image` opt set, pick widest                                                                    |
| `author`                              | Person \| Organization \| array \| @id ref       | normalized object or array | resolve `@id` against `@graph` index; coerce `@type` to `Person`\|`Organization`; ensure `name`; drop unknown fields                                                                  |
| `recipeIngredient`                    | string[] \| PropertyValue \| nested arrays       | string[] (≥1)              | flatten; PropertyValue → `${value} ${unitText} ${name}`.trim; `normalizeString` each; throw `INVALID_RECIPE` if empty                                                                 |
| `recipeInstructions`                  | string \| HowToStep \| HowToSection \| array     | HowToStep[] (preferred)    | recursive walk; HowToSection becomes a HowToStep with `name`+`text` joined OR flattened with section `name` carried into first child; plain string → `{ "@type": "HowToStep", text }` |
| `recipeYield`                         | string \| number \| QuantitativeValue \| array   | string \| number           | first non-empty; QuantitativeValue → `${value} ${unitText}`; range "4-6" preserved verbatim                                                                                           |
| `prepTime` / `cookTime` / `totalTime` | ISO 8601 \| "1h 30m" \| "1.5 hours" \| range     | ISO 8601 (`PT…H…M…S`)      | `parseDuration` → emit canonical ISO; ranges keep upper bound; reject if regex `/^PT(\d+H)?(\d+M)?(\d+S)?$/` would fail (drop with warning)                                           |
| `keywords`                            | string \| string[]                               | string[]                   | CSV split, trim, dedupe (case-insensitive)                                                                                                                                            |
| `suitableForDiet`                     | string \| string[] \| schema.org URL             | string[]                   | strip URL prefix `https://schema.org/`, keep enum tokens                                                                                                                              |
| `nutrition`                           | NutritionInformation                             | same shape                 | passthrough; coerce numeric values to strings (Zod expects strings)                                                                                                                   |
| `datePublished`                       | ISO date \| date                                 | string                     | passthrough as ISO 8601                                                                                                                                                               |

Top-level wrapper always sets `"@context": "https://schema.org"` and `"@type": "Recipe"` to satisfy literal validators in `content.config.ts:23-24`. Drops any extra fields (recipe-scrapers' `change_keys` equivalent isn't needed — Zod will strip on output, but we strip pre-validation to avoid surprises).

After normalization, run `recipeSchema.safeParse(recipe)`; on failure, throw `IngestError("INVALID_RECIPE")` with the Zod issues attached.

## Critical files in repo

**To extend (scaffold already exists):**

- `packages/recipe-ingestion/package.json` — bump `vite-plus` to `^0.1.19`; add `zod` to `dependencies`; keep name `recipe-ingestion`
- `packages/recipe-ingestion/vite.config.ts` — add `test:` block (see Test setup)
- `packages/recipe-ingestion/src/index.ts` — replace stub with public exports
- `packages/recipe-ingestion/tests/index.test.ts` — replace stub with first real test (or delete and add the focused test files listed in the layout)

**To create new in package:**

- `packages/recipe-ingestion/{LICENSE, README.md, src/schema.ts, src/fetch.ts, src/extract.ts, src/find-recipe.ts, src/types.ts, src/normalize/**, src/util/**, tests/**}`

**To modify in repo:**

- `apps/website/src/content.config.ts` — replace inline `recipeSchema` (lines 4-50) and helper schemas (`isoDuration`, `personOrOrg`, `howToStep` on lines 4-20) with `import { recipeSchema } from "recipe-ingestion"`; leave `recipeMetaSchema` and `ingredientSchema` (lines 52-85) as-is
- `apps/website/package.json` — add `"recipe-ingestion": "workspace:*"` to `dependencies`
- `pnpm-workspace.yaml` — already covers `packages/*`, no edit needed

**Logic to reuse / consolidate:**

- `apps/website/src/lib/duration.ts` — _display formatter_ (`formatIsoDuration` for "1h 30m" output). Keep as-is; the new package's `parseDuration` is the inverse direction. No conflict.
- `apps/website/src/lib/instructions.ts` — `normalizeInstructions` (display-side) stays; ingest-side normalizer in `packages/recipe-ingestion/src/normalize/instructions.ts` produces the canonical HowToStep[] that this consumer reads.

## Logic ported from recipe-scrapers (MIT)

Cite in `LICENSE` and per-file headers where applicable:

- **Duration parsing** — `recipe_scrapers/_utils.py:150-202` (`get_minutes`) + ISO-8601 + Unicode-fraction handling → `src/util/duration-parse.ts`
- **String normalization** — `_utils.py:294-320` (`normalize_string`) → `src/util/strings.ts`
- **Yield extraction** — `_utils.py:205-286` (`get_yields`) + singular/plural patterns → `src/normalize/yield.ts`
- **Schema.org graph walking + @id resolution** — `_schemaorg.py:42-145` → `src/find-recipe.ts` + `src/util/refs.ts`
- **Image normalization** — `_schemaorg.py:195-213` → `src/normalize/image.ts`
- **Instruction union walker** — `_schemaorg.py:272-327` (HowToStep / HowToSection recursion) → `src/normalize/instructions.ts`
- **Ingredient PropertyValue → string** — `_schemaorg.py:215-253` → `src/normalize/ingredients.ts`

Not ported (out of v1 scope): plugin/middleware system, OpenGraph fallback (`_opengraph.py`), Microdata via `extruct`, ingredient grouping (`_grouping_utils.py`), domain registry (`SCRAPERS` dict).

## Implementation order

1. **Test setup** — bump `vite-plus` to `^0.1.19`; add `test:` block to `packages/recipe-ingestion/vite.config.ts`; verify scaffold test (`tests/index.test.ts`) still passes via `vp run recipe-ingestion#test`. Add `zod` dep.
2. **Move schema** — copy `recipeSchema` (and `personOrOrg`, `howToStep`, `isoDuration`) into `src/schema.ts`; export `Recipe` type; leave website on inline schema until step 9 to keep diff small.
3. **`extractJsonLd`** — regex `<script type="application/ld+json"[^>]*>([\s\S]*?)</script>` + `JSON.parse`; tolerate parse failures per script (collect warnings). No DOM parser needed for v1.
4. **`findRecipe`** — walk array roots, `@graph` arrays, `mainEntity`/`mainEntityOfPage`; match `@type === "Recipe"` (string or array containing "Recipe").
5. **Util layer** — `strings.ts`, `duration-parse.ts`, `refs.ts` with focused tests.
6. **Normalize layer** — one file per field, each with its own test; `normalize/index.ts` composes them and emits warnings.
7. **`parseRecipe`** — orchestrate extract → find → normalize → Zod validate → IngestResult.
8. **`fetchRecipe`** — `globalThis.fetch` with timeout via AbortController; UA header; redirect follow on by default; capture `canonical` from `<link rel="canonical">` and `og:site_name`. Mock via `vi.stubGlobal("fetch", …)` in tests.
9. **Website integration** — replace inline schema in `apps/website/src/content.config.ts:4-50` with import; add workspace dep to `apps/website/package.json`; run `vp check && vp build` to confirm zero behavior change.
10. **Fixtures + integration tests** — capture 3 HTML samples (one with HowToSection, one with PropertyValue ingredients, one with @id author ref); commit under `tests/fixtures/`; assert `IngestResult.recipe` Zod-validates and matches snapshots.

## Verification

End-to-end checks (all must pass before declaring done):

1. `vp install` from repo root resolves the new workspace package.
2. `vp run recipe-ingestion#check` — type-check + lint clean.
3. `vp run recipe-ingestion#test` — unit + integration tests green; ≥1 fixture exercises each union variant in the table above.
4. `vp run website#check` — website still type-checks after schema import swap.
5. `vp run website#build` — full Astro build succeeds; existing recipes (`miso-butter-ramen`, `ras-el-hanout`, `harissa`) render byte-identical (compare `dist/` HTML before/after).
6. Manual end-to-end: in a Node REPL or scratch script, `await fetchRecipe("https://www.bbcgoodfood.com/recipes/<some-recipe>")` returns an `IngestResult` whose `recipe` passes `recipeSchema.safeParse` and whose JSON serialization can be dropped into `apps/website/src/content/recipes/<slug>.json` without further edits.
7. Error-path manual check: `fetchRecipe("https://example.com")` (no JSON-LD) throws `IngestError` with `code === "NO_JSONLD"` — does not crash.

## Out of scope (v1)

- Microdata / RDFa parsing
- OpenGraph fallbacks
- Per-domain CSS-selector scrapers
- Auto-generation of meta sidecars (`ingredientLinks`, `goesWellWith`, etc.)
- Slug derivation / collection routing (recipe vs spicemix vs sauce) — caller decides where to write
- Image download / pipeline
- Rate limiting, caching, robots.txt — caller's responsibility
