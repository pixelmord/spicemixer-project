import type { EntityRefCollection } from "./entity-ref.ts";

export const RESERVED_SLUGS = new Set([
  "sauces",
  "rubs",
  "oils",
  "pickles",
  "chutneys",
  "marinades",
  "spicemixes",
]);

export type SlugCollisionWarning = {
  kind: "cross-collection-collision";
  otherCollection: EntityRefCollection;
  slug: string;
};

export type SlugValidationResult =
  | { ok: false; reason: "reserved" }
  | { ok: true; warning?: SlugCollisionWarning };

export function validateSlug(
  slug: string,
  collection: EntityRefCollection,
  existingSlugs: Partial<Record<EntityRefCollection, string[]>> = {},
): SlugValidationResult {
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return { ok: false, reason: "reserved" };
  }

  const otherCollection: EntityRefCollection =
    collection === "ingredients" ? "mixtures" : "ingredients";
  const otherSlugs = existingSlugs[otherCollection] ?? [];

  if (otherSlugs.includes(slug)) {
    return {
      ok: true,
      warning: { kind: "cross-collection-collision", otherCollection, slug },
    };
  }

  return { ok: true };
}
