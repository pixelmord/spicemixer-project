import { getPublishedPairings } from "../recipe-augment.ts";
import type { PublishedPairing } from "../recipe-augment.ts";

export async function pairingSlugPaths(locale: string) {
  const allPairings = await getPublishedPairings();

  const bySlug = new Map<string, PublishedPairing[]>();
  for (const p of allPairings) {
    const bucket = bySlug.get(p.id) ?? [];
    bucket.push(p);
    bySlug.set(p.id, bucket);
  }

  const paths: Array<{
    params: { slug: string };
    props: { pairing: PublishedPairing; isFallback: boolean; canonicalLocale: string };
  }> = [];

  for (const [slug, entries] of bySlug) {
    const localeEntry = entries.find((e) => e.locale === locale);
    if (localeEntry) {
      paths.push({
        params: { slug },
        props: {
          pairing: localeEntry,
          isFallback: false,
          canonicalLocale: localeEntry.canonicalLocale,
        },
      });
      continue;
    }
    const fallback = entries[0];
    if (fallback) {
      paths.push({
        params: { slug },
        props: { pairing: fallback, isFallback: true, canonicalLocale: fallback.canonicalLocale },
      });
    }
  }

  return paths;
}
