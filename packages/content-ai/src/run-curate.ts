import {
  proposeIngredientImprovements,
  proposeIngredientTranslation,
  proposeIngredientPairings,
} from "./curate-ingredient.ts";
import {
  proposeRecipeImprovements,
  proposeRecipeTranslation,
  proposeIngredientLinks,
  proposeTags,
  detectLanguage,
  proposeRelations,
  proposeSlug,
} from "./curate-recipe.ts";
import { proposePairingImprovements, proposePairingTranslation } from "./curate-pairing.ts";

export const CURATE_REGISTRY = {
  ingredient: {
    improve: proposeIngredientImprovements,
    translate: proposeIngredientTranslation,
    pairings: proposeIngredientPairings,
  },
  recipe: {
    improve: proposeRecipeImprovements,
    translate: proposeRecipeTranslation,
    links: proposeIngredientLinks,
    tags: proposeTags,
    language: detectLanguage,
    relations: proposeRelations,
    slug: proposeSlug,
  },
  pairing: {
    improve: proposePairingImprovements,
    translate: proposePairingTranslation,
  },
};

export type EntityKind = keyof typeof CURATE_REGISTRY;
export type CurateOp<K extends EntityKind> = keyof (typeof CURATE_REGISTRY)[K] & string;

export async function runCurate(
  kind: EntityKind,
  operation: string,
  ...args: unknown[]
): Promise<unknown> {
  const ops = CURATE_REGISTRY[kind];
  if (!ops) throw new Error(`Unknown EntityKind: "${kind}"`);
  const fn = (ops as Record<string, (...a: unknown[]) => Promise<unknown>>)[operation];
  if (typeof fn !== "function")
    throw new Error(`Unknown curate operation "${operation}" for kind "${kind}"`);
  return fn(...args);
}
