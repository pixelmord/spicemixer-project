import type { RecipeExtract } from "../../src/schemas/recipe-extract.ts";

const REQUIRED = ["name", "recipeIngredient", "recipeInstructions", "recipeYield"] as const;

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function requiredFieldsPresent(actual: RecipeExtract): number {
  const present = REQUIRED.filter((field) => isNonEmpty(actual[field]));
  return present.length / REQUIRED.length;
}
