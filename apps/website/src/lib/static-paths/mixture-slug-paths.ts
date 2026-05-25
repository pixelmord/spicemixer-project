import { type CollectionEntry, getCollection } from "astro:content";
import type { Lang } from "../../i18n/translations.ts";
import { getPublished, slugFromLocaleId } from "../recipe-augment.ts";
import {
  MIXTURE_KINDS,
  MIXTURE_KIND_PLURALS,
  buildKindBySlug,
  type MixtureKind,
} from "../mixture-schema.ts";
import { resolvePublished } from "../published-entity.ts";

export async function mixtureSlugPaths(locale: Lang) {
  const rawMeta = await getCollection("meta");
  const kindBySlug = buildKindBySlug(rawMeta);
  const allMixtures = await getPublished("mixtures");
  const enMixtures = allMixtures.filter((m: { id: string }) => m.id.startsWith("en/"));
  const uniqueSlugs = [...new Set(allMixtures.map((e: { id: string }) => slugFromLocaleId(e.id)))];

  const kindPaths = MIXTURE_KINDS.map((kind) => ({
    params: { slug: MIXTURE_KIND_PLURALS[kind] },
    props: {
      kind,
      kindMixtures: enMixtures.filter((m: { id: string }) => kindBySlug.get(m.id) === kind),
      mix: null as CollectionEntry<"mixtures"> | null,
      isFallback: false,
      canonicalLocale: "en",
    },
  }));

  const detailPathResults = await Promise.all(
    uniqueSlugs.map(async (slug) => {
      const resolved = await resolvePublished("mixtures", slug, locale);
      if (!resolved) return null;
      return {
        params: { slug },
        props: {
          kind: null as MixtureKind | null,
          kindMixtures: null as CollectionEntry<"mixtures">[] | null,
          mix: resolved.entity as CollectionEntry<"mixtures">,
          isFallback: resolved.isFallback,
          canonicalLocale: resolved.canonicalLocale,
        },
      };
    }),
  );
  const detailPaths = detailPathResults.filter((p): p is NonNullable<typeof p> => p !== null);

  return [...kindPaths, ...detailPaths];
}
