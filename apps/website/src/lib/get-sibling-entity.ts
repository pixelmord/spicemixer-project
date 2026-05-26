import { actions } from "astro:actions";
import type { SiblingLocale } from "@registry/components/use-ai-suggestions";

type EntityKind = "recipe" | "mixture" | "ingredient" | "pairing";

const KIND_TO_COLLECTION: Record<EntityKind, "recipes" | "mixtures" | "ingredients" | "pairings"> =
  {
    recipe: "recipes",
    mixture: "mixtures",
    ingredient: "ingredients",
    pairing: "pairings",
  };

function hashField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function computeFieldHashes(data: Record<string, unknown>): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const [key, val] of Object.entries(data)) {
    hashes[key] = hashField(val);
  }
  return hashes;
}

export interface GetSiblingEntityParams {
  kind: EntityKind;
  /** Base slug without locale prefix (e.g. "cardamom"). For recipe/mixture the
   *  current entity's locale-prefixed id is also accepted (e.g. "en/cardamom-cake")
   *  for backwards compatibility, but the preferred form is slug + currentLocale. */
  slug: string;
  /** Sibling locale to fetch */
  locale: string;
  /** Current entity locale — required when kind is "recipe" or "mixture" to resolve
   *  the translations map on the meta sidecar. */
  currentLocale?: string;
}

/**
 * Fetches the sibling-locale version of an entity and returns a `SiblingLocale`
 * object suitable for passing to `useAiSuggestions({ siblingLocale })`.
 *
 * - Ingredients / pairings: looked up by `<sibling-locale>/<slug>` (shared slug).
 * - Recipes / mixtures: resolved via `translations[<sibling-locale>]` on the
 *   source entity's meta sidecar, then fetched by the translated slug.
 */
export async function getSiblingEntity({
  kind,
  slug,
  locale,
  currentLocale,
}: GetSiblingEntityParams): Promise<SiblingLocale | null> {
  const collection = KIND_TO_COLLECTION[kind];

  if (kind === "ingredient" || kind === "pairing") {
    const { data: result, error } = await actions.getItem({
      collection: collection as "ingredients",
      id: `${locale}/${slug}`,
    });
    if (error || !result?.item) return null;

    const itemData = result.item.data as Record<string, unknown>;
    return {
      ref: { kind, id: `${locale}/${slug}` },
      data: itemData,
      locale,
      fieldHashes: computeFieldHashes(itemData),
    };
  }

  // recipe / mixture — need to resolve via translations map
  const resolvedCurrentLocale = currentLocale ?? (slug.includes("/") ? slug.split("/")[0] : null);
  const baseSlug =
    slug.includes("/") && currentLocale === undefined ? slug.split("/").slice(1).join("/") : slug;

  if (!resolvedCurrentLocale) return null;

  const { data: sourceResult, error: sourceError } = await actions.getItem({
    collection: collection as "recipes",
    id: `${resolvedCurrentLocale}/${baseSlug}`,
  });
  if (sourceError || !sourceResult) return null;

  const metaData = sourceResult.meta as Record<string, unknown> | null;
  const translations =
    metaData && typeof metaData["translations"] === "object" && metaData["translations"] !== null
      ? (metaData["translations"] as Record<string, string>)
      : {};

  const siblingSlug = translations[locale];
  if (!siblingSlug) {
    // Symmetric fallback: the current entity's translations map may be missing the forward link
    // (e.g. if it was wiped by a stale form save after aiCreateTranslation wrote the back-link).
    // Try fetching the sibling at the same base slug and verify it carries a back-reference to us.
    const { data: fallbackResult, error: fallbackError } = await actions.getItem({
      collection: collection as "recipes",
      id: `${locale}/${baseSlug}`,
    });
    if (!fallbackError && fallbackResult?.item) {
      const fallbackMeta = fallbackResult.meta as Record<string, unknown> | null;
      const fallbackTranslations =
        fallbackMeta &&
        typeof fallbackMeta["translations"] === "object" &&
        fallbackMeta["translations"] !== null
          ? (fallbackMeta["translations"] as Record<string, string>)
          : {};
      if (fallbackTranslations[resolvedCurrentLocale] === baseSlug) {
        const siblingItemData = fallbackResult.item.data as Record<string, unknown>;
        return {
          ref: { kind, id: `${locale}/${baseSlug}` },
          data: siblingItemData,
          locale,
          fieldHashes: computeFieldHashes(siblingItemData),
        };
      }
    }
    return null;
  }

  const { data: siblingResult, error: siblingError } = await actions.getItem({
    collection: collection as "recipes",
    id: `${locale}/${siblingSlug}`,
  });
  if (siblingError || !siblingResult?.item) return null;

  const siblingData = siblingResult.item.data as Record<string, unknown>;
  return {
    ref: { kind, id: `${locale}/${siblingSlug}` },
    data: siblingData,
    locale,
    fieldHashes: computeFieldHashes(siblingData),
  };
}
