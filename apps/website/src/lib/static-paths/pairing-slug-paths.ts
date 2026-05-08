import { getPublishedPairings } from "../recipe-augment.ts";

export async function pairingSlugPaths() {
  const pairings = await getPublishedPairings();
  return pairings.map((p) => ({
    params: { slug: p.id },
    props: { pairing: p },
  }));
}
