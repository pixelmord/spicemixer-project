import { z } from "zod";

export const ENTITY_COLLECTIONS = ["ingredients", "mixtures"] as const;
export type EntityRefCollection = (typeof ENTITY_COLLECTIONS)[number];

export const entityRefSchema = z.object({
  collection: z.enum(["ingredients", "mixtures"]),
  slug: z.string().min(1),
});

export type EntityRef = z.infer<typeof entityRefSchema>;

export function parse(input: unknown): EntityRef {
  return entityRefSchema.parse(input);
}

export function format(ref: EntityRef): string {
  return `${ref.collection}:${ref.slug}`;
}

export function equal(a: EntityRef, b: EntityRef): boolean {
  return a.collection === b.collection && a.slug === b.slug;
}

/** Returns all refs from allRefs that share the same slug but belong to the other collection. */
export function inverseLookup(ref: EntityRef, allRefs: EntityRef[]): EntityRef[] {
  return allRefs.filter((r) => r.slug === ref.slug && r.collection !== ref.collection);
}
