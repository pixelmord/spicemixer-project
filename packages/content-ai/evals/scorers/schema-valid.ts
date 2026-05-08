import { recipeExtractSchema } from "../../src/schemas/recipe-extract.ts";

export function schemaValid(actual: unknown): boolean {
  return recipeExtractSchema.safeParse(actual).success;
}
