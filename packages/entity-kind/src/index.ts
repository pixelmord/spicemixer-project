export type { EntityKind, ContentCollection } from "./kind.ts";
export { collectionToKind } from "./kind.ts";

export type { EntityKindConfig } from "./registry.ts";
export { getConfig } from "./registry.ts";

export type { FieldDiff, ItemDiff, ChangeKind, WordToken } from "./diff.ts";
export { diffWords, diffIngredients, diffRecipes, diffPairings } from "./diff.ts";

export type { CompletenessResult, CompletenessModel } from "./completeness.ts";
export {
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

export type { Ingredient, Pairing, Recipe } from "./schemas.ts";
export {
  ingredientSchema,
  pairingSchema,
  recipeSchema,
  INGREDIENT_PARTS,
  INGREDIENT_FLAVOR_PROFILE,
  INGREDIENT_CATEGORIES,
} from "./schemas.ts";
