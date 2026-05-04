export type EntityKind = "ingredient" | "recipe" | "pairing";

export const collectionToKind = {
  ingredients: "ingredient",
  recipes: "recipe",
  mixtures: "recipe",
  pairings: "pairing",
} as const satisfies Record<string, EntityKind>;

export type ContentCollection = keyof typeof collectionToKind;
