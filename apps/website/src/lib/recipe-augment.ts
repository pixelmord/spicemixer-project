import { getEntry, getCollection } from "astro:content";
import type { MixtureKind } from "./mixture-schema.ts";
import { INGREDIENT_META } from "./meta-sidecar.ts";

/** Locale-aware ingredient lookup with EN fallback. */
export async function getIngredient(slug: string, locale: string) {
  return (
    (await getEntry("ingredients", `${locale}/${slug}`)) ??
    (await getEntry("ingredients", `en/${slug}`))
  );
}

export type RecipeKind = "recipes" | "mixtures";

export type MetaRef = { collection: RecipeKind | "ingredients"; slug: string };
export type IngredientLink = {
  pattern: string;
  slug: string;
  kind?: "ingredient" | "recipe";
  collection?: string;
};
export type ExternalSource = { url: string; title: string; source?: string };

export type Meta = {
  kind?: "recipe" | MixtureKind;
  draft?: boolean;
  language?: string;
  locale?: string;
  translationOf?: string;
  translations?: Record<string, string>;
  variantOf?: string;
  variants: string[];
  goesWellWith: MetaRef[];
  usesBase: MetaRef[];
  ingredientLinks: IngredientLink[];
  externalSources: ExternalSource[];
  tags: string[];
};

type MetaEntry = { id: string; data: { draft?: boolean; ingredientLinks?: IngredientLink[] } };
type NamedEntry = { id: string; data: { name: string } };
type PairingData = {
  ingredients: [string, string];
  descriptions?: Record<string, string>;
  description?: string;
  draft?: boolean;
  image?: string;
};

const EMPTY_META: Meta = {
  variants: [],
  goesWellWith: [],
  usesBase: [],
  ingredientLinks: [],
  externalSources: [],
  tags: [],
  translations: {},
};

export async function getMeta(kind: RecipeKind, slug: string): Promise<Meta> {
  const entry = await getEntry("meta", `${kind}/${slug}`);
  if (!entry) return EMPTY_META;
  return entry.data as Meta;
}

/**
 * Return entries from a recipe-shaped collection with `meta.draft === true`
 * filtered out. Missing meta is treated as published (default behavior for
 * legacy entries without a sidecar).
 */
export async function getPublished<K extends RecipeKind>(kind: K) {
  const [entries, rawMeta] = await Promise.all([getCollection(kind), getCollection("meta")]);
  const allMeta = rawMeta as MetaEntry[];
  const drafts = new Set(allMeta.filter((m) => m.data.draft === true).map((m) => m.id));
  return entries.filter((e: { id: string }) => !drafts.has(`${kind}/${e.id}`));
}

/**
 * Return ingredient entries (optionally scoped to a locale) with
 * `ingredientMeta.draft === true` filtered out. Missing meta is published.
 */
export async function getPublishedIngredients(locale?: string) {
  const [rawEntries, rawMeta] = await Promise.all([
    getCollection("ingredients"),
    getCollection(INGREDIENT_META),
  ]);
  const entries = rawEntries as { id: string }[];
  const allMeta = rawMeta as MetaEntry[];
  const drafts = new Set(allMeta.filter((m) => m.data.draft === true).map((m) => m.id));
  const scoped = locale ? entries.filter((e) => e.id.startsWith(`${locale}/`)) : entries;
  return scoped.filter((e) => !drafts.has(e.id));
}

export type LinkedIngredient = { text: string; slug?: string };

export function linkIngredients(
  ingredients: string[],
  links: IngredientLink[],
): LinkedIngredient[] {
  if (!links.length) return ingredients.map((text) => ({ text }));
  return ingredients.map((ing) => {
    const match = links.find((l) => ing.toLowerCase().includes(l.pattern.toLowerCase()));
    return match ? { text: ing, slug: match.slug } : { text: ing };
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function annotateTextHtml(
  text: string,
  links: IngredientLink[],
  ingredientBase = "/ingredients",
  recipeBase = "",
): string {
  if (!links.length) return escapeHtml(text);
  const sorted = [...links].sort((a, b) => b.pattern.length - a.pattern.length);

  type Span = { text: string; slug?: string; href?: string };
  let spans: Span[] = [{ text }];

  for (const link of sorted) {
    const { pattern, slug, kind, collection } = link;
    const col = collection ?? "recipes";
    const href = kind === "recipe" ? `${recipeBase}/${col}/${slug}/` : `${ingredientBase}/${slug}/`;
    const next: Span[] = [];
    for (const span of spans) {
      if (span.slug) {
        next.push(span);
        continue;
      }
      const lower = span.text.toLowerCase();
      const idx = lower.indexOf(pattern.toLowerCase());
      if (idx === -1) {
        next.push(span);
        continue;
      }
      if (idx > 0) next.push({ text: span.text.slice(0, idx) });
      next.push({ text: span.text.slice(idx, idx + pattern.length), slug, href });
      const tail = span.text.slice(idx + pattern.length);
      if (tail) next.push({ text: tail });
    }
    spans = next;
  }

  return spans
    .map((s) =>
      s.href
        ? `<a href="${s.href}" class="underline decoration-dotted underline-offset-2 text-amber-700 hover:text-amber-900">${escapeHtml(s.text)}</a>`
        : escapeHtml(s.text),
    )
    .join("");
}

export interface PublishedPairing {
  id: string;
  ingredients: [string, string];
  descriptions: Record<string, string>;
  image?: string;
  regions: string[];
}

/** Get all published pairings, each annotated with the union of both endpoints' regions. */
export async function getPublishedPairings(): Promise<PublishedPairing[]> {
  const [rawPairings, rawIngMeta] = await Promise.all([
    getCollection("pairings"),
    getCollection(INGREDIENT_META),
  ]);

  const regionsBySlug = new Map<string, string[]>();
  for (const m of rawIngMeta as Array<{ id: string; data: { region?: string[] } }>) {
    const slug = m.id.replace(/^[a-z]{2}\//, "");
    const prev = regionsBySlug.get(slug) ?? [];
    regionsBySlug.set(slug, [...new Set([...prev, ...(m.data.region ?? [])])]);
  }

  return (rawPairings as Array<{ id: string; data: PairingData }>)
    .filter((p) => !p.data.draft)
    .map((p) => {
      const [a, b] = p.data.ingredients;
      const regions = [
        ...new Set([...(regionsBySlug.get(a) ?? []), ...(regionsBySlug.get(b) ?? [])]),
      ];
      return {
        id: p.id,
        ingredients: p.data.ingredients,
        descriptions: p.data.descriptions ?? {},
        image: p.data.image,
        regions,
      };
    });
}

/** Canonical pairing id: sort both slugs alphabetically, join with --. */
export function pairingId(slugA: string, slugB: string): string {
  return [slugA, slugB].sort().join("--");
}

export interface PairingEntity {
  id: string;
  ingredients: [string, string];
  descriptions: Record<string, string>;
  /** Legacy single-locale field, may be absent after migration */
  description?: string;
}

/** Get all pairings that include a given ingredient slug. */
export async function getPairings(slug: string): Promise<PairingEntity[]> {
  const all = (await getCollection("pairings")) as { id: string; data: PairingData }[];
  return all
    .filter((entry) => entry.data.ingredients.includes(slug))
    .map((entry) => ({
      id: entry.id,
      ingredients: entry.data.ingredients as [string, string],
      descriptions: (entry.data.descriptions ?? {}) as Record<string, string>,
      description: entry.data.description,
    }));
}

export async function getIngredientMeta(locale: string, slug: string) {
  const entry = await getEntry(INGREDIENT_META, `${locale}/${slug}`);
  return (entry?.data ?? null) as import("../content.config.ts").IngredientMeta | null;
}

async function findByIngredientLinks(
  localePrefix: string,
  predicate: (link: IngredientLink) => boolean,
): Promise<Array<{ name: string; href: string; kind: RecipeKind }>> {
  const [rawMeta, rawRecipes, rawMixtures] = await Promise.all([
    getCollection("meta"),
    getCollection("recipes"),
    getCollection("mixtures"),
  ]);

  const allMeta = rawMeta as MetaEntry[];
  const recipes = rawRecipes as NamedEntry[];
  const mixtures = rawMixtures as NamedEntry[];

  const byKind: Record<RecipeKind, Map<string, string>> = {
    recipes: new Map(recipes.map((r) => [r.id, r.data.name])),
    mixtures: new Map(mixtures.map((r) => [r.id, r.data.name])),
  };

  return allMeta
    .filter((entry) => (entry.data.ingredientLinks ?? []).some(predicate))
    .map((entry) => {
      const slash = entry.id.indexOf("/");
      if (slash === -1) return null;
      const kind = entry.id.slice(0, slash) as RecipeKind;
      const slug = entry.id.slice(slash + 1);
      if (!(kind in byKind)) return null;
      const name = byKind[kind].get(slug);
      if (!name) return null;
      return { name, href: `${localePrefix}/${kind}/${slug}/`, kind };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function getRecipeUsedIn(
  recipeSlug: string,
  recipeCollection: RecipeKind,
  localePrefix: string,
): Promise<Array<{ name: string; href: string; kind: RecipeKind }>> {
  return findByIngredientLinks(
    localePrefix,
    (l) => l.kind === "recipe" && l.slug === recipeSlug && l.collection === recipeCollection,
  );
}

export async function resolveRefs(
  refs: MetaRef[],
  localePrefix: string,
): Promise<Array<{ name: string; href: string }>> {
  const results = await Promise.all(
    refs.map(async ({ collection, slug }) => {
      let e: { data: { name: string } } | null | undefined;
      if (collection === "recipes") {
        e = await getEntry("recipes", slug);
      } else if (collection === "ingredients") {
        e = await getEntry("ingredients", `en/${slug}`);
      } else {
        e = await getEntry("mixtures", slug);
      }
      if (!e) return null;
      const itemPath = collection + "/" + slug;
      return { name: e.data.name, href: `${localePrefix}/${itemPath}/` };
    }),
  );
  return results.filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function resolveVariants(
  kind: RecipeKind,
  slugs: string[],
  localePrefix: string,
): Promise<Array<{ name: string; href: string }>> {
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const e =
        kind === "recipes" ? await getEntry("recipes", slug) : await getEntry("mixtures", slug);
      if (!e) return null;
      return { name: e.data.name, href: `${localePrefix}/${kind}/${slug}/` };
    }),
  );
  return results.filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function getUsedIn(
  ingredientSlug: string,
  localePrefix: string,
): Promise<Array<{ name: string; href: string; kind: RecipeKind }>> {
  return findByIngredientLinks(localePrefix, (l) => l.slug === ingredientSlug);
}
