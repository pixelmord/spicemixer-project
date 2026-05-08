import type { CollectionEntry } from "astro:content";
import type { Lang } from "../../i18n/translations.ts";
import { getPublished, slugFromLocaleId } from "../recipe-augment.ts";
import { resolvePublished } from "../published-entity.ts";

export async function recipeSlugPaths(locale: Lang) {
  const enEntries = await getPublished("recipes", "en");
  const paths = await Promise.all(
    enEntries.map(async (entry) => {
      const slug = slugFromLocaleId(entry.id);
      const resolved = await resolvePublished("recipes", slug, locale);
      if (!resolved) return null;
      return {
        params: { slug },
        props: {
          recipe: resolved.entity as CollectionEntry<"recipes">,
          isFallback: resolved.isFallback,
          canonicalLocale: resolved.canonicalLocale,
        },
      };
    }),
  );
  return paths.filter((p): p is NonNullable<typeof p> => p !== null);
}
