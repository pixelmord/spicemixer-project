import type { ZodTypeAny } from "zod";
import type { EntityKind } from "./kind.ts";
import type { FieldDiff } from "./diff.ts";
import type { CompletenessModel } from "./completeness.ts";
import { ingredientSchema, pairingSchema, recipeSchema } from "./schemas.ts";
import { diffIngredients, diffRecipes, diffPairings } from "./diff.ts";
import {
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
  RECIPE_REQUIRED,
  RECIPE_RECOMMENDED,
  PAIRING_REQUIRED,
  PAIRING_RECOMMENDED,
  scoreIngredient,
  scoreRecipe,
  scorePairing,
} from "./completeness.ts";

export interface EntityKindConfig {
  schema: ZodTypeAny;
  proposers: Record<string, (...args: unknown[]) => Promise<unknown>>;
  diff: (existing: Record<string, unknown>, proposed: Record<string, unknown>) => FieldDiff[];
  completeness: CompletenessModel;
  routePrefix: string;
}

const registry: Record<EntityKind, EntityKindConfig> = {
  ingredient: {
    schema: ingredientSchema,
    proposers: {},
    diff: diffIngredients,
    completeness: {
      required: INGREDIENT_REQUIRED,
      recommended: INGREDIENT_RECOMMENDED,
      score: scoreIngredient,
    },
    routePrefix: "/ingredients/",
  },

  recipe: {
    schema: recipeSchema,
    proposers: {},
    diff: diffRecipes,
    completeness: {
      required: RECIPE_REQUIRED,
      recommended: RECIPE_RECOMMENDED,
      score: scoreRecipe,
    },
    routePrefix: "/recipes/",
  },

  pairing: {
    schema: pairingSchema,
    proposers: {},
    diff: diffPairings,
    completeness: {
      required: PAIRING_REQUIRED,
      recommended: PAIRING_RECOMMENDED,
      score: (entity, ctx) => scorePairing(entity, (ctx?.["locale"] as string) ?? "en"),
    },
    routePrefix: "/pairings/",
  },
};

export function getConfig(kind: EntityKind): EntityKindConfig {
  return registry[kind];
}
