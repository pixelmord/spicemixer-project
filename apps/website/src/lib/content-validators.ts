import type { ContentStore } from "./content-store.ts";
import {
  validateSlugUniqueness,
  validateVariantsClosure,
  type SlugConflict,
  type VariantsViolation,
} from "entity-kind";

function slugFromId(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

export type SlugsByCollection = {
  ingredients: string[];
  mixtures: string[];
  recipes: string[];
};

/**
 * Reads all content collections from the store and returns a deduplicated
 * list of slugs per collection (across all locales).
 */
export async function collectSlugsByCollection(store: ContentStore): Promise<SlugsByCollection> {
  const [ingredients, mixtures, recipes] = await Promise.all([
    store.list("ingredients"),
    store.list("mixtures"),
    store.list("recipes"),
  ]);

  const dedup = (items: { id: string }[]) => [...new Set(items.map((i) => slugFromId(i.id)))];

  return {
    ingredients: dedup(ingredients),
    mixtures: dedup(mixtures),
    recipes: dedup(recipes),
  };
}

/**
 * Reads meta for all recipes/mixtures and returns a map of slug → variants[]
 * for canonical-locale entities only.
 *
 * An entity is canonical when its meta.canonicalLocale equals the locale in
 * its id and it has no translationOf set.
 */
export async function collectCanonicalVariants(
  store: ContentStore,
): Promise<Record<string, string[]>> {
  const metaItems = await store.list("meta");
  const result: Record<string, string[]> = {};

  for (const item of metaItems) {
    const meta = item.data as Record<string, unknown>;
    const canonicalLocale = meta["canonicalLocale"];
    if (!canonicalLocale) continue;

    // Meta id: "kind/locale/slug"
    const [, locale, slug] = item.id.split("/");
    if (!slug || locale !== canonicalLocale) continue;
    if (meta["translationOf"]) continue;

    const variants = Array.isArray(meta["variants"]) ? (meta["variants"] as string[]) : [];
    result[slug] = variants;
  }

  return result;
}

export type ContentValidationResult = {
  slugConflicts: SlugConflict[];
  variantsViolations: VariantsViolation[];
};

/**
 * Runs both build-time validators against the given content store.
 *
 * - Cross-collection slug uniqueness: any slug in more than one of
 *   ingredients / mixtures / recipes is a build error.
 * - Variants closure symmetry: for every canonical entity X with non-empty
 *   variants, every Y in X.variants must exist and carry X back.
 */
export async function validateContent(store: ContentStore): Promise<ContentValidationResult> {
  const [slugsByCollection, canonicalVariants] = await Promise.all([
    collectSlugsByCollection(store),
    collectCanonicalVariants(store),
  ]);

  return {
    slugConflicts: validateSlugUniqueness(slugsByCollection),
    variantsViolations: validateVariantsClosure(canonicalVariants),
  };
}
