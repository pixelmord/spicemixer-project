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
  diff: (
    existing: Record<string, unknown>,
    proposed: Record<string, unknown>,
    ctx?: Record<string, unknown>,
  ) => FieldDiff[];
  completeness: CompletenessModel;
  routePrefix: string;
  /** null = this kind does not participate in translation staleness tracking. */
  translationCanonicalKey: ((locale: string, slug: string) => string) | null;
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
    translationCanonicalKey: (locale, slug) => `${locale}/${slug}`,
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
    translationCanonicalKey: (_locale, slug) => slug,
  },

  pairing: {
    schema: pairingSchema,
    proposers: {},
    diff: diffPairings,
    completeness: {
      required: PAIRING_REQUIRED,
      recommended: PAIRING_RECOMMENDED,
      score: scorePairing,
    },
    routePrefix: "/pairings/",
    translationCanonicalKey: null,
  },
};

export function getConfig(kind: EntityKind): EntityKindConfig {
  return registry[kind];
}
