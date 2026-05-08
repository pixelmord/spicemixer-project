import type { CollectionEntry } from "astro:content";
import type { Lang } from "../../i18n/translations.ts";
import { getPublishedIngredients } from "../recipe-augment.ts";
import { resolvePublished } from "../published-entity.ts";

export async function ingredientSlugPaths(locale: Lang) {
  const canonicalIngredients = await getPublishedIngredients("en");
  const paths = await Promise.all(
    canonicalIngredients.map(async (enEntry) => {
      const slug = enEntry.id.replace(/^en\//, "");
      const resolved = await resolvePublished("ingredients", slug, locale);
      if (!resolved) return null;
      return {
        params: { slug },
        props: {
          ingredient: resolved.entity as CollectionEntry<"ingredients">,
          isFallback: resolved.isFallback,
          canonicalLocale: resolved.canonicalLocale,
        },
      };
    }),
  );
  return paths.filter((p): p is NonNullable<typeof p> => p !== null);
}
