# Plan: Admin section for content editing in `apps/website`

> Final location: `docs/plans/admin-section.md` in the repo (per the user's request to save to `@docs/plans/`). This file is the plan-mode scratchpad; copy on execution.

## Context

The website is currently a read-only Astro static site. Editors hand-author JSON files under `apps/website/src/content/{recipes,spicemixes,sauces,meta,ingredients}/`. Now we want a **local admin UI** for managing content, with the explicit non-goal of preserving "FS write" as the only mechanism — the storage layer must be pluggable so a future deployment can swap to GitHub API or webhook-based persistence without rewriting the admin UI.

The newly built `recipe-ingestion` package (`packages/recipe-ingestion`) is the second leg: an admin-side "Import from URL" widget posts a third-party recipe URL, calls `fetchRecipe`, and pre-fills an editor form with the normalized JSON-LD.

Outcome: in `astro dev` mode, navigating to `http://localhost:4321/admin` shows a dashboard listing every content item across all collections with draft/published indicators and a per-item completeness score; editors can click into a row to open a TanStack Form editor (with array support for ingredients/instructions), save changes back to disk, create new content, mark drafts as published, and import recipes from URLs. None of this is reachable from non-localhost origins.

## Decisions (confirmed)

| Decision              | Choice                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Component primitives  | shadcn/ui with **Base-UI** (`shadcn init --base base`) — explicitly NOT Radix                                               |
| Form library          | TanStack Form + Zod, integrated via shadcn's `Field`/`FieldLabel`/`FieldError` components                                   |
| Data table            | TanStack Table via shadcn's Base-UI data-table pattern                                                                      |
| Backend               | **Astro Actions** in `src/actions/index.ts` (cleaner than raw endpoints; first-class FormData + Zod validation)             |
| Output mode + adapter | Keep `output: "static"`; add **`@astrojs/node`** adapter (standalone) so on-demand-rendered admin/action routes work in dev |
| Storage abstraction   | `ContentStore` interface; `LocalFsStore` impl now, `GitHubApiStore` stub for later                                          |
| Draft flag location   | `meta.draft: boolean` (sidecar) — keeps recipe JSON-LD pure schema.org                                                      |
| Admin i18n            | Skipped — `/admin/*` is English-only, not duplicated to `/de/admin/*`                                                       |
| Local-only gate       | Astro middleware refuses non-localhost requests for `/admin/*` and `/_actions/*`                                            |
| Completeness          | Schema-required + per-kind recommended fields, scored as `filled / total recommended` (0–100%)                              |

## Architecture

```
apps/website/
├── astro.config.mjs              # add @astrojs/node adapter; i18n routing excludes /admin
├── package.json                  # + @astrojs/node, @tanstack/react-form, @tanstack/react-table,
│                                 #   class-variance-authority, clsx, tailwind-merge, lucide-react
├── components.json               # shadcn config (base=base, style=new-york, aliases=@/*)
├── tsconfig.json                 # add `paths: { "@/*": ["./src/*"] }`
├── src/
│   ├── middleware.ts             # localhost gate for /admin/* + /_actions/*
│   ├── actions/
│   │   └── index.ts              # Astro Actions: list, get, create, update, delete, publish, ingestUrl
│   ├── lib/
│   │   ├── utils.ts              # cn() — clsx + tailwind-merge (shadcn convention)
│   │   ├── content-store.ts      # ContentStore interface
│   │   ├── stores/
│   │   │   ├── local-fs.ts       # LocalFsStore — read/write JSON under src/content/
│   │   │   └── github.ts         # GitHubApiStore — STUB with TODO; throws "not implemented"
│   │   ├── completeness.ts       # scoreRecipe, scoreIngredient, scoreMeta — per-kind rules
│   │   └── slugify.ts            # name → kebab-case slug helper
│   ├── styles/
│   │   └── global.css            # already has @import "tailwindcss"; add CSS vars from shadcn init
│   ├── components/
│   │   ├── ui/                   # shadcn-generated: button, input, label, textarea, select,
│   │   │                         #   field, table, tabs, dialog, badge, card, sonner, dropdown-menu,
│   │   │                         #   data-table (Base-UI flavour)
│   │   └── admin/
│   │       ├── AdminShell.tsx    # sidebar + header layout wrapper
│   │       ├── ContentTable.tsx  # TanStack Table over a flattened content list
│   │       ├── CompletenessBadge.tsx  # circular % indicator, colour-graded
│   │       ├── DraftBadge.tsx
│   │       ├── RecipeForm.tsx    # TanStack Form for recipe/spicemix/sauce + meta sidecar
│   │       ├── IngredientForm.tsx
│   │       ├── ArrayField.tsx    # generic add/remove/reorder helper for ingredients/instructions/keywords
│   │       └── ImportFromUrl.tsx # URL paste → calls actions.ingestUrl → prefills RecipeForm
│   └── pages/
│       └── admin/
│           ├── index.astro       # dashboard: stats + recent items + quick actions
│           ├── content.astro     # full content table (all collections, filterable)
│           ├── recipes/
│           │   ├── new.astro
│           │   ├── import.astro            # hosts <ImportFromUrl client:load />
│           │   └── [slug]/edit.astro
│           ├── spicemixes/{new,import,[slug]/edit}.astro
│           ├── sauces/{new,import,[slug]/edit}.astro
│           └── ingredients/
│               ├── new.astro                # locale picker
│               └── [locale]/[slug]/edit.astro
```

Every file under `src/pages/admin/` and the actions endpoint is **`export const prerender = false`** so the static build skips them and the Node adapter handles them at runtime.

## ContentStore interface (the pluggability seam)

```ts
// src/lib/content-store.ts
export type Collection = "recipes" | "spicemixes" | "sauces" | "ingredients" | "meta";

export interface ContentItem<T = unknown> {
  collection: Collection;
  id: string; // locale-prefixed slug for ingredients ("en/cardamom"), kind-prefixed for meta ("recipes/foo"), bare slug otherwise
  data: T;
  updatedAt?: string; // optional mtime
}

export interface ContentStore {
  list(collection: Collection): Promise<ContentItem[]>;
  get(collection: Collection, id: string): Promise<ContentItem | null>;
  put(collection: Collection, id: string, data: unknown): Promise<void>;
  delete(collection: Collection, id: string): Promise<void>;
}

// Resolved at module load via env var; defaults to LocalFsStore.
export function getStore(): ContentStore {
  /* ... */
}
```

`LocalFsStore` writes JSON with `JSON.stringify(data, null, 2) + "\n"` to keep diffs clean. `GitHubApiStore` lives as a stub — its `put` calls `octokit.repos.createOrUpdateFileContents` and is wired through env vars (`GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`) — but for v1 it just `throw new Error("not implemented")`. The interface seals the contract so the swap is later trivial.

All Astro Actions go through `getStore()`. Admin pages never touch `node:fs` directly.

## Astro Actions surface

`src/actions/index.ts`:

```ts
export const server = {
  // Reads
  listAll: defineAction({ handler: async () => { /* aggregates all collections + meta join */ } }),
  getItem: defineAction({ input: z.object({ collection, id }), handler: ... }),

  // Writes — recipe-shaped (used for recipes/spicemixes/sauces)
  saveRecipe: defineAction({
    accept: "json",
    input: z.object({ collection: z.enum(["recipes","spicemixes","sauces"]), slug: z.string(),
                       recipe: recipeSchema, meta: recipeMetaSchema }),
    handler: ({ collection, slug, recipe, meta }) => {
      await store.put(collection, slug, recipe);
      await store.put("meta", `${collection}/${slug}`, meta);
    },
  }),
  saveIngredient: defineAction({ /* locale + slug + ingredientSchema */ }),
  deleteItem: defineAction({ input: ..., handler: ... }),
  publish: defineAction({ /* sets meta.draft=false */ }),
  unpublish: defineAction({ /* sets meta.draft=true */ }),

  // Ingestion — used by the Import-from-URL widget
  ingestUrl: defineAction({
    input: z.object({ url: z.string().url() }),
    handler: async ({ url }) => {
      const result = await fetchRecipe(url);  // from "recipe-ingestion"
      return { recipe: result.recipe, source: result.source, warnings: result.warnings };
    },
  }),
};
```

Actions return `{ data, error }` to React via `actions.saveRecipe({...})` import from `astro:actions`. Form submissions can also use `accept: "form"` directly bound to a `<form action={actions.saveRecipe}>` — but for v1 we'll prefer JSON-mode actions called from React (cleaner UX with TanStack Form's optimistic state).

## Schema additions

Add to `recipeMetaSchema` (in `apps/website/src/content.config.ts`):

```ts
draft: z.boolean().default(false),
```

The site's existing `getMeta()` helper already returns an empty meta when the sidecar is absent; with the default value, all existing content stays "published" automatically.

Update the public route loaders that list recipes/spicemixes/sauces to filter `meta.draft === true` items in production builds (admin sees everything regardless).

## Completeness scoring

`src/lib/completeness.ts` exports `scoreItem(item): { score: 0-100, missing: string[] }`. Per-kind required + recommended buckets:

| Kind                      | Required (failure if missing)                        | Recommended (counted in score)                                                                                                                            |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe / Spicemix / Sauce | name, recipeIngredient (≥1), recipeInstructions (≥1) | description, image, author, recipeYield, prepTime, cookTime, totalTime, recipeCategory, recipeCuisine, keywords, datePublished, meta.ingredientLinks (≥1) |
| Ingredient                | name, category                                       | summary, description, image, origin (≥1), flavorNotes (≥1), pairings (≥1)                                                                                 |

Required missing → score 0 + red "incomplete" badge. Otherwise `score = round(filled / recommended.length * 100)`. Colour bands: <40 red, 40–79 amber, ≥80 green.

## Shadcn / Base-UI initialisation

```bash
cd apps/website
pnpm dlx shadcn@latest init --base base   # Base-UI primitives, NOT Radix
pnpm dlx shadcn@latest add button input label textarea select field table tabs dialog \
  badge card sonner dropdown-menu data-table
```

`init --base base` writes `components.json` with the Base-UI registry pre-selected; the `data-table` page at `https://ui.shadcn.com/docs/components/base/data-table` is the matching pattern. Each component lands in `src/components/ui/*.tsx`. The `cn()` util goes to `src/lib/utils.ts`.

## TanStack Form patterns we'll need

- **Top-level form**: `useForm({ defaultValues, validators: { onSubmit: recipeSchema.merge(metaSchema) } })`
- **Array fields** (ingredients, instructions, keywords, suitableForDiet, meta.ingredientLinks, meta.goesWellWith, meta.usesBase, meta.externalSources, ingredient.origin/flavorNotes/pairings): use `<form.Field name="recipeIngredient" mode="array">` with `pushValue`, `removeValue`, `swapValues` for reorder
- **Subfields**: `name="recipeIngredient[${i}]"` for primitives, `name="recipeInstructions[${i}].text"` for HowToStep
- **Field render**: matches shadcn's `<Field>` / `<FieldLabel>` / `<FieldError>` pattern
- **Submit**: `handleSubmit` calls the appropriate action; `actions.saveRecipe({ collection, slug, recipe: value, meta })`

## Middleware (localhost gate)

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
const ALLOWED = new Set(["localhost", "127.0.0.1", "::1"]);
const PROTECTED = /^\/(admin|_actions)/;

export const onRequest = defineMiddleware(async (context, next) => {
  if (PROTECTED.test(context.url.pathname)) {
    if (!ALLOWED.has(context.url.hostname)) return new Response("Not Found", { status: 404 });
  }
  return next();
});
```

## Files to create / modify

**To create (new):**

- `apps/website/components.json` (via shadcn CLI)
- `apps/website/src/lib/utils.ts` (cn helper, generated by shadcn init)
- `apps/website/src/lib/content-store.ts`
- `apps/website/src/lib/stores/local-fs.ts`
- `apps/website/src/lib/stores/github.ts` (stub)
- `apps/website/src/lib/completeness.ts`
- `apps/website/src/lib/slugify.ts`
- `apps/website/src/middleware.ts`
- `apps/website/src/actions/index.ts`
- `apps/website/src/components/ui/*.tsx` (≈12 files, generated by shadcn add)
- `apps/website/src/components/admin/*.tsx` (≈8 files)
- `apps/website/src/pages/admin/**` (≈14 files)

**To modify:**

- `apps/website/astro.config.mjs` — add `@astrojs/node` adapter, exclude `/admin/*` from i18n routing
- `apps/website/package.json` — add deps: `@astrojs/node`, `@tanstack/react-form`, `@tanstack/react-table`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`
- `apps/website/tsconfig.json` — add `compilerOptions.paths: { "@/*": ["./src/*"] }` and `baseUrl: "."`
- `apps/website/src/content.config.ts` — add `draft: z.boolean().default(false)` to `recipeMetaSchema`
- `apps/website/src/styles/global.css` — append shadcn's `@theme` CSS variable block (added by shadcn init)
- `apps/website/src/pages/{recipes,spicemixes,sauces}/index.astro` and the `/de/` mirrors — filter `meta.draft === true` from public listings (also `[slug].astro` returns 404 for drafts)

**Existing utilities to reuse (no rewrite):**

- `apps/website/src/lib/recipe-augment.ts` — `getMeta(kind, slug)` already handles missing sidecars; admin reuses for joining content + meta in the listing
- `apps/website/src/lib/instructions.ts` — `normalizeInstructions`, `firstImage`, `keywordList` for table cell rendering
- `apps/website/src/lib/duration.ts` — `formatIsoDuration` for displaying times in the table
- `recipe-ingestion` package — `fetchRecipe`, `IngestError`, `Recipe` type for the import widget

## Implementation order

1. **Adapter + config** — install `@astrojs/node`, switch needed `astro.config.mjs` config, add `paths` to `tsconfig.json`, verify `vp run dev` still serves static pages.
2. **Shadcn init (Base-UI)** — `shadcn init --base base`, accept `cn()` util, add the component list above. Verify `Button` renders in a scratch `.tsx` page.
3. **ContentStore + LocalFsStore** — interface + FS impl + tests (`vp test` in website if it has a test script, else under a `tests/` folder we add). Includes `list/get/put/delete` round-trips against a temp dir.
4. **Schema update** — add `draft` to `recipeMetaSchema`, run `vp run build` to confirm no regression. Update existing 7 meta files to explicitly include `draft: false` (or rely on default — verify Astro's content loader honours Zod defaults on read).
5. **Astro Actions** — implement all actions, gate by middleware. Smoke-test each via `actions.foo.fetch(...)` in dev.
6. **Middleware** — localhost gate, verify with `curl -H "Host: example.com" http://localhost:4321/admin` returns 404.
7. **Completeness scoring** — pure functions + unit tests covering each kind.
8. **Admin shell + content table** — `AdminShell.tsx`, `ContentTable.tsx`, `CompletenessBadge.tsx`, `DraftBadge.tsx`. Mount on `/admin/index.astro` with `client:load` directive on the React components. Verify all 32 existing items render with correct draft/completeness states.
9. **RecipeForm + IngredientForm** — TanStack Form with array fields. Plug into `/admin/recipes/[slug]/edit.astro` first, then duplicate routing for spicemixes/sauces.
10. **Import-from-URL widget** — `ImportFromUrl.tsx` calls `actions.ingestUrl({ url })`, on success pre-fills `RecipeForm` (via shared form state). Edit-and-save lands as a new recipe with `meta.draft = true`.
11. **Polish** — toast notifications via `sonner`, loading states, optimistic updates on the table after save.
12. **GitHub store stub** — `github.ts` with the planned method signatures and TODO comments. Confirms the seam works without implementing it.

## Verification (end-to-end)

1. `vp install` from repo root resolves all new deps.
2. `vp run website#dev` starts; `http://localhost:4321/admin` loads the dashboard; `http://127.0.0.1:4321/admin` works; `curl -H "Host: foo.com" http://localhost:4321/admin` returns 404.
3. The content table lists all 32 existing items; recipes show their completeness % (the four hand-authored recipes should be ≥80% green, ingredients with summaries already authored ≥60% amber).
4. Edit `recipes/miso-butter-ramen` — change a value, save — diff `apps/website/src/content/recipes/miso-butter-ramen.json` shows only the changed field; `vp run website#build` still produces 36 pages.
5. Click "Import from URL", paste a real recipe URL (e.g. BBC Good Food), confirm the form prefills with a normalized Recipe; save creates a new file with `meta.draft = true`; the public listing on `/recipes/` does NOT show it; the admin table does.
6. Toggle a recipe draft → published, confirm it appears in `/recipes/` after save (dev hot-reloads the content collection).
7. Type-checks pass: `vp run website#check`. Tests pass: `vp test` for both `recipe-ingestion` (existing) and any new website tests.
8. **Pluggability check**: temporarily switch `getStore()` to return `GitHubApiStore`; `saveRecipe` must throw the not-implemented error from inside the store, NOT crash from any UI code path. The error surfaces as a toast.

## Out of scope (v1)

- Authentication / user accounts (gate is hostname-only)
- Real GitHub API write implementation (stub only)
- Webhook-based persistence (stub only)
- Image uploads / media library
- Bulk operations (multi-select delete, batch publish)
- Diff view / version history
- Admin localization (English only)
- Public production deploy of the admin (no adapter prod build target — Node adapter only loads in dev)
- Auto-generation of meta.ingredientLinks (still author-controlled, but the form makes it easier to enter)
- WYSIWYG markdown editor for descriptions (plain `<Textarea>` for v1)
