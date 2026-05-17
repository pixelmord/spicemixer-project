import { getEntry, getCollection } from "astro:content";
import type { EndpointRef } from "entity-kind";
import type { MixtureKind } from "./mixture-schema.ts";
import { INGREDIENT_META, PAIRING_META } from "./meta-sidecar.ts";
import { regionsForPairing } from "./region-derivation.ts";

/** Locale-aware ingredient lookup with EN fallback. */
export async function getIngredient(slug: string, locale: string) {
  return (
    (await getEntry("ingredients", `${locale}/${slug}`)) ??
    (await getEntry("ingredients", `en/${slug}`))
  );
}

export type RecipeKind = "recipes" | "mixtures";

/** Cross-collection relation reference stored in meta (goesWellWith, usesBase). No locale — links by slug only. */
export type RelationRef = { collection: RecipeKind | "ingredients"; slug: string };
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
  region?: string[];
  language?: string;
  locale?: string;
  translationOf?: string;
  translations?: Record<string, string>;
  variantOf?: string;
  variants: string[];
  goesWellWith: RelationRef[];
  usesBase: RelationRef[];
  ingredientLinks: IngredientLink[];
  externalSources: ExternalSource[];
  tags: string[];
};

type MetaEntry = { id: string; data: { draft?: boolean; ingredientLinks?: IngredientLink[] } };
type NamedEntry = { id: string; data: { name: string } };
type PairingData = {
  endpoints: [EndpointRef, EndpointRef];
  description: string;
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

export async function getMeta(kind: RecipeKind, locale: string, slug: string): Promise<Meta> {
  const entry = await getEntry("meta", `${kind}/${locale}/${slug}`);
  if (!entry) return EMPTY_META;
  return entry.data as Meta;
}

/**
 * Return entries from a recipe-shaped collection with `meta.draft === true`
 * filtered out. Missing meta is treated as published (default behavior for
 * legacy entries without a sidecar).
 * Entry IDs are `locale/slug`; meta IDs are `kind/locale/slug`.
 * Pass `locale` to scope results to a single locale (e.g. "en").
 */
export async function getPublished<K extends RecipeKind>(kind: K, locale?: string) {
  const [entries, rawMeta] = await Promise.all([getCollection(kind), getCollection("meta")]);
  const allMeta = rawMeta as MetaEntry[];
  const drafts = new Set(allMeta.filter((m) => m.data.draft === true).map((m) => m.id));
  const scoped = locale
    ? entries.filter((e: { id: string }) => e.id.startsWith(`${locale}/`))
    : entries;
  return scoped.filter((e: { id: string }) => !drafts.has(`${kind}/${e.id}`));
}

/** Extract just the slug from a locale-prefixed ID like "en/miso-butter-ramen". */
export function slugFromLocaleId(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
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
  /** Slug only (no locale prefix): "caraway--cumin" */
  id: string;
  /** Locale of the content file that was resolved */
  locale: string;
  endpoints: [EndpointRef, EndpointRef];
  description: string;
  canonicalLocale: string;
  featured: boolean;
  image?: string;
  regions: string[];
}

/** Get all published pairings, each annotated with the union of both endpoints' regions.
 * Pass `locale` to scope to a single locale. Without locale, returns all published entries. */
export async function getPublishedPairings(locale?: string): Promise<PublishedPairing[]> {
  const [rawPairings, rawIngredients, rawPairingMeta] = await Promise.all([
    getCollection("pairings"),
    getCollection("ingredients"),
    getCollection(PAIRING_META),
  ]);

  type PairingMetaEntry = {
    id: string;
    data: { draft?: boolean; canonicalLocale?: string; featured?: boolean };
  };
  const metaById = new Map<string, PairingMetaEntry["data"]>();
  const draftIds = new Set<string>();
  for (const m of rawPairingMeta as PairingMetaEntry[]) {
    metaById.set(m.id, m.data);
    if (m.data.draft === true) draftIds.add(m.id);
  }

  const regionsBySlug = new Map<string, string[]>();
  for (const m of rawIngredients as Array<{ id: string; data: { region?: string[] } }>) {
    const slug = m.id.replace(/^[a-z]{2}\//, "");
    const prev = regionsBySlug.get(slug) ?? [];
    regionsBySlug.set(slug, [...new Set([...prev, ...(m.data.region ?? [])])]);
  }

  return (rawPairings as Array<{ id: string; data: PairingData }>)
    .filter((p) => !draftIds.has(p.id))
    .filter((p) => !locale || p.id.startsWith(`${locale}/`))
    .map((p) => {
      const slash = p.id.indexOf("/");
      const pLocale = p.id.slice(0, slash);
      const slug = p.id.slice(slash + 1);
      const [a, b] = p.data.endpoints;
      const regions = regionsForPairing(
        a.collection === "ingredients" ? regionsBySlug.get(a.slug) : undefined,
        b.collection === "ingredients" ? regionsBySlug.get(b.slug) : undefined,
      );
      const meta = metaById.get(p.id);
      const canonicalLocale = meta?.canonicalLocale ?? pLocale;
      return {
        id: slug,
        locale: pLocale,
        endpoints: p.data.endpoints,
        description: p.data.description,
        canonicalLocale,
        featured: meta?.featured ?? false,
        image: p.data.image,
        regions,
      };
    });
}

export interface PairingEntity {
  /** Slug only (no locale prefix): "caraway--cumin" */
  id: string;
  /** Locale of the content file that was resolved */
  locale: string;
  endpoints: [EndpointRef, EndpointRef];
  description: string;
  featured: boolean;
}

/** Get pairings containing a given endpoint slug, preferring `locale` with EN fallback. */
export async function getPairings(slug: string, locale = "en"): Promise<PairingEntity[]> {
  const [all, rawPairingMeta] = await Promise.all([
    getCollection("pairings") as Promise<{ id: string; data: PairingData }[]>,
    getCollection(PAIRING_META) as Promise<{ id: string; data: { featured?: boolean } }[]>,
  ]);

  const featuredById = new Map<string, boolean>();
  for (const m of rawPairingMeta) {
    featuredById.set(m.id, m.data.featured ?? false);
  }

  const matching = all.filter((e) => e.data.endpoints.some((ep) => ep.slug === slug));

  const groups = new Map<string, Array<{ id: string; data: PairingData }>>();
  for (const entry of matching) {
    const pairingSlug = slugFromLocaleId(entry.id);
    const bucket = groups.get(pairingSlug) ?? [];
    bucket.push(entry);
    groups.set(pairingSlug, bucket);
  }

  const result: PairingEntity[] = [];
  for (const [pairingSlug, entries] of groups) {
    const chosen =
      entries.find((e) => e.id.startsWith(`${locale}/`)) ??
      entries.find((e) => e.id.startsWith("en/")) ??
      entries[0];
    if (!chosen) continue;
    const chosenLocale = chosen.id.slice(0, chosen.id.indexOf("/"));
    result.push({
      id: pairingSlug,
      locale: chosenLocale,
      endpoints: chosen.data.endpoints,
      description: chosen.data.description,
      featured: featuredById.get(chosen.id) ?? false,
    });
  }

  return result;
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

  // Entry IDs are "locale/slug"; build map keyed by locale/slug for name lookups.
  const byKind: Record<RecipeKind, Map<string, string>> = {
    recipes: new Map(recipes.map((r) => [r.id, r.data.name])),
    mixtures: new Map(mixtures.map((r) => [r.id, r.data.name])),
  };

  return allMeta
    .filter((entry) => (entry.data.ingredientLinks ?? []).some(predicate))
    .map((entry) => {
      // meta ID format: "kind/locale/slug" (3 segments)
      const firstSlash = entry.id.indexOf("/");
      if (firstSlash === -1) return null;
      const kind = entry.id.slice(0, firstSlash) as RecipeKind;
      const rest = entry.id.slice(firstSlash + 1); // "locale/slug"
      if (!(kind in byKind)) return null;
      const name = byKind[kind].get(rest); // byKind keyed by "locale/slug"
      if (!name) return null;
      const slug = slugFromLocaleId(rest); // just slug for URL
      return { name, href: `${localePrefix}/${kind}/${slug}/`, kind };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

async function getRecipeUsedIn(
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
  refs: RelationRef[],
  localePrefix: string,
  locale = "en",
): Promise<Array<{ name: string; href: string }>> {
  const results = await Promise.all(
    refs.map(async ({ collection, slug }) => {
      const e =
        (await getEntry(collection, `${locale}/${slug}`)) ??
        (await getEntry(collection, `en/${slug}`));
      if (!e) return null;
      return { name: e.data.name, href: localePrefix + "/" + collection + "/" + slug + "/" };
    }),
  );
  return results.filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function resolveVariants(
  kind: RecipeKind,
  slugs: string[],
  localePrefix: string,
  locale = "en",
): Promise<Array<{ name: string; href: string }>> {
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const e = (await getEntry(kind, `${locale}/${slug}`)) ?? (await getEntry(kind, `en/${slug}`));
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

/** Resolve the display name of an endpoint, with locale fallback to EN. */
export async function resolveEndpointName(
  endpoint: EndpointRef,
  locale: string,
): Promise<string | null> {
  const e =
    (await getEntry(endpoint.collection, `${locale}/${endpoint.slug}`)) ??
    (await getEntry(endpoint.collection, `en/${endpoint.slug}`));
  return e ? (e.data as { name: string }).name : null;
}

/**
 * Returns the variants array from the canonical-locale meta when this entity is a
 * translation (meta.translationOf is set), otherwise from the entity's own meta.
 * This follows ADR 0003: variants are authored on canonical-locale meta only.
 */
export async function getEffectiveVariants(
  kind: RecipeKind,
  slug: string,
  meta: Pick<Meta, "variants" | "translationOf">,
  canonicalLocale: string,
): Promise<string[]> {
  if (!meta.translationOf) return meta.variants;
  const canonicalMeta = await getMeta(kind, canonicalLocale, slug);
  return canonicalMeta.variants;
}
