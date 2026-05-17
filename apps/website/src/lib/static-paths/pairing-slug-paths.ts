import type { Lang } from "../../i18n/translations.ts";
import { getPublishedPairings } from "../recipe-augment.ts";

export async function pairingSlugPaths(locale: Lang) {
  const pairings = await getPublishedPairings(locale);
  return pairings.map((p) => ({
    params: { slug: p.id },
    props: { pairing: p },
  }));
}
