import type { Collection, ContentStore } from "./content-store.ts";
import type { MetaSidecar } from "./meta-sidecar.ts";
import { NotFoundError } from "./errors.ts";
import { entityMeta } from "@/lib/entity-meta.ts";

/**
 * Addresses a single content record and its meta sidecar across every kind
 * (recipes, mixtures, ingredients, pairings). `slug` is the bare slug for
 * recipes/ingredients and the pairing id (e.g. "anise--cardamom") for
 * pairings — both key as `${locale}/${slug}` in content storage; the
 * meta-key divergence is absorbed by the sidecar's own resolution.
 */
export interface EntityCrudRef {
  collection: Collection;
  locale: string;
  slug: string;
}

const contentId = (ref: EntityCrudRef): string => `${ref.locale}/${ref.slug}`;

/** Delete the content record and its meta sidecar. Idempotent. */
export async function deleteEntity(
  store: ContentStore,
  sidecar: MetaSidecar,
  ref: EntityCrudRef,
): Promise<void> {
  await store.delete(ref.collection, contentId(ref));
  await sidecar.remove(ref);
}

/**
 * Flip the published/draft state by merging `{ draft }` into the meta sidecar.
 * Requires the content record to exist — publishing happens from a form or
 * list where the record is already saved; a missing record means a stale view
 * (e.g. deleted between list render and click), so we throw rather than
 * resurrect an orphaned meta sidecar.
 */
export async function setPublishState(
  store: ContentStore,
  sidecar: MetaSidecar,
  ref: EntityCrudRef,
  draft: boolean,
): Promise<void> {
  const existing = await store.get(ref.collection, contentId(ref));
  if (!existing) {
    throw new NotFoundError(`${ref.collection} ${contentId(ref)} not found.`);
  }
  await entityMeta.merge(sidecar, ref, { draft });
}
