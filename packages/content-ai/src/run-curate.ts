import { proposeIngredientImprovements, proposeIngredientPairings } from "./curate-ingredient.ts";
import {
  proposeRecipeImprovements,
  proposeIngredientLinks,
  proposeTags,
  detectLanguage,
  proposeRelations,
  proposeSlug,
} from "./curate-recipe.ts";
import { proposePairingImprovements } from "./curate-pairing.ts";

// Translation is not a curate operation. Use runFill with sibling-locale source instead (PRD 10.2).
export const CURATE_REGISTRY = {
  ingredient: {
    improve: proposeIngredientImprovements,
    pairings: proposeIngredientPairings,
  },
  recipe: {
    improve: proposeRecipeImprovements,
    links: proposeIngredientLinks,
    tags: proposeTags,
    language: detectLanguage,
    relations: proposeRelations,
    slug: proposeSlug,
  },
  pairing: {
    improve: proposePairingImprovements,
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
