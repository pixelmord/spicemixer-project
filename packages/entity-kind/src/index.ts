export type { EntityKind, ContentCollection } from "./kind.ts";
export { collectionToKind } from "./kind.ts";

export type { EntityKindConfig } from "./registry.ts";
export { getConfig } from "./registry.ts";

export type { FieldDiff, ItemDiff, ChangeKind, WordToken } from "./diff.ts";
export { diffWords, diffIngredients, diffRecipes, diffPairings, hasChanges } from "./diff.ts";

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

export type {
  Ingredient,
  IngredientMeta,
  Pairing,
  PairingMeta,
  EndpointRef,
  Recipe,
  RecipeMeta,
  RegionCode,
} from "./schemas.ts";

export type { SlugConflict, VariantsViolation } from "./validators.ts";
export { validateSlugUniqueness, validateVariantsClosure } from "./validators.ts";
export {
  ingredientSchema,
  ingredientMetaSchema,
  pairingSchema,
  pairingMetaSchema,
  endpointRefSchema,
  ENDPOINT_COLLECTIONS,
  recipeSchema,
  recipeMetaSchema,
  INGREDIENT_PARTS,
  INGREDIENT_FLAVOR_PROFILE,
  INGREDIENT_CATEGORIES,
  MIXTURE_KINDS,
  REGIONS,
} from "./schemas.ts";
