import type { MetaSidecar, SyncCollection } from "./meta-sidecar.ts";

export type VariantsCollection = "recipes" | "mixtures";

type MetaEntry = { id: string; slug: string; data: Record<string, unknown> };

function parseCollectionMetas(
  collection: VariantsCollection,
  all: Array<{ id: string; data: unknown }>,
): MetaEntry[] {
  const prefix = `${collection}/`;
  const result: MetaEntry[] = [];
  for (const item of all) {
    if (!item.id.startsWith(prefix)) continue;
    const rest = item.id.slice(prefix.length); // "locale/slug"
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) continue; // legacy flat format — skip
    const slug = rest.slice(slashIdx + 1);
    result.push({ id: item.id, slug, data: item.data as Record<string, unknown> });
  }
  return result;
}

function slugVariants(entry: MetaEntry): string[] {
  return (entry.data["variants"] as string[] | undefined) ?? [];
}

/**
 * Compute the transitive closure of a variants equivalence group and
 * write the unified list to every affected member's canonical-locale meta.
 *
 * Returns the unified list for the entity being saved (to be stored as its
 * own variants by the caller).
 *
 * On unlink (newVariants === []):
 * - Removes entitySlug from every other canonical meta that currently lists it.
 * - Returns [].
 *
 * Translation metas (those with a truthy translationOf field) are never
 * written.
 */
export async function applyVariantsClosure(
  sidecar: MetaSidecar,
  collection: VariantsCollection,
  entitySlug: string,
  newVariants: string[],
): Promise<string[]> {
  const all = await sidecar.listSync(collection as SyncCollection);
  const allEntries = parseCollectionMetas(collection, all);
  const canonicalEntries = allEntries.filter((e) => !e.data["translationOf"]);

  if (newVariants.length === 0) {
    // Unlink: strip entitySlug from every other canonical member's variants.
    for (const entry of canonicalEntries) {
      if (entry.slug === entitySlug) continue;
      const variants = slugVariants(entry);
      if (!variants.includes(entitySlug)) continue;
      await sidecar.updateById("meta", entry.id, {
        ...entry.data,
        variants: variants.filter((v) => v !== entitySlug),
      });
    }
    return [];
  }

  // Build a lookup map from slug to canonical entry (first canonical wins).
  const bySlug = new Map<string, MetaEntry>();
  for (const entry of canonicalEntries) {
    if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry);
  }

  // Compute transitive closure starting from entitySlug + newVariants.
  // Only include slugs that have a canonical meta in the store.
  const knownVariants = newVariants.filter((s) => bySlug.has(s));
  const group = new Set<string>([entitySlug, ...knownVariants]);
  const worklist = [...knownVariants];
  while (worklist.length > 0) {
    const current = worklist.pop()!;
    const entry = bySlug.get(current);
    if (!entry) continue;
    for (const v of slugVariants(entry)) {
      if (!group.has(v)) {
        group.add(v);
        if (bySlug.has(v)) worklist.push(v);
      }
    }
  }

  // Write unified list to every member except the entity being saved
  // (its own meta is written by the caller via saveEntity).
  const listFor = (slug: string) =>
    Array.from(group)
      .filter((s) => s !== slug)
      .sort();

  for (const memberSlug of group) {
    if (memberSlug === entitySlug) continue;
    const entry = bySlug.get(memberSlug);
    if (!entry) continue;
    await sidecar.updateById("meta", entry.id, {
      ...entry.data,
      variants: listFor(memberSlug),
    });
  }

  return listFor(entitySlug);
}
