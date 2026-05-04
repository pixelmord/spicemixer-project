import { getEntry, getCollection } from "astro:content";
import { INGREDIENT_META } from "./meta-sidecar.ts";

export type PublishedCollection = "ingredients" | "recipes" | "mixtures";

export type Resolved = {
  entity: unknown;
  canonicalLocale: string;
  renderedLocale: string;
  isFallback: boolean;
  isDraft: boolean;
};

async function getIngredientCanonicalLocale(slug: string, hintLocale?: string): Promise<string> {
  const localesToCheck = hintLocale && hintLocale !== "en" ? ["en", hintLocale] : ["en"];
  for (const locale of localesToCheck) {
    const meta = await getEntry(INGREDIENT_META, `${locale}/${slug}`);
    const data = meta?.data as { canonicalLocale?: string } | undefined;
    if (data?.canonicalLocale) return data.canonicalLocale;
  }

  const allMeta = await getCollection(INGREDIENT_META);
  for (const m of allMeta as Array<{ id: string; data: { canonicalLocale?: string } }>) {
    if (m.id.endsWith(`/${slug}`) && m.data.canonicalLocale) {
      return m.data.canonicalLocale;
    }
  }
  return "en";
}

async function isIngredientDraft(locale: string, slug: string): Promise<boolean> {
  const meta = await getEntry(INGREDIENT_META, `${locale}/${slug}`);
  return (meta?.data as { draft?: boolean } | undefined)?.draft === true;
}

async function isRecipeDraft(kind: "recipes" | "mixtures", slug: string): Promise<boolean> {
  const meta = await getEntry("meta", `${kind}/${slug}`);
  return (meta?.data as { draft?: boolean } | undefined)?.draft === true;
}

async function getRecipeCanonicalLocale(
  kind: "recipes" | "mixtures",
  slug: string,
): Promise<string> {
  const meta = await getEntry("meta", `${kind}/${slug}`);
  return (meta?.data as { canonicalLocale?: string } | undefined)?.canonicalLocale ?? "en";
}

// Owns draft filtering, canonical-locale lookup, and locale fallback — no other module should re-implement these.
export async function resolvePublished(
  collection: PublishedCollection,
  slug: string,
  requestedLocale: string,
): Promise<Resolved | null> {
  if (collection === "ingredients") {
    const requestedEntry = await getEntry("ingredients", `${requestedLocale}/${slug}`);
    if (requestedEntry && !(await isIngredientDraft(requestedLocale, slug))) {
      return {
        entity: requestedEntry,
        canonicalLocale: await getIngredientCanonicalLocale(slug, requestedLocale),
        renderedLocale: requestedLocale,
        isFallback: false,
        isDraft: false,
      };
    }

    const canonicalLocale = await getIngredientCanonicalLocale(slug, requestedLocale);
    if (canonicalLocale === requestedLocale) return null;

    const canonicalEntry = await getEntry("ingredients", `${canonicalLocale}/${slug}`);
    if (!canonicalEntry || (await isIngredientDraft(canonicalLocale, slug))) return null;

    return {
      entity: canonicalEntry,
      canonicalLocale,
      renderedLocale: canonicalLocale,
      isFallback: true,
      isDraft: false,
    };
  }

  // recipes, mixtures — no locale prefix in ID
  const entry = await getEntry(collection, slug);
  if (!entry) return null;
  if (await isRecipeDraft(collection, slug)) return null;

  return {
    entity: entry,
    canonicalLocale: await getRecipeCanonicalLocale(collection, slug),
    renderedLocale: requestedLocale,
    isFallback: false,
    isDraft: false,
  };
}
