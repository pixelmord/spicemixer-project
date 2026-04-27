import { recipeSchema } from "../schema.ts";
import type { Recipe } from "../schema.ts";
import type { IngestWarning } from "../types.ts";
import { IngestError } from "../errors.ts";
import { buildRefIndex } from "../util/refs.ts";
import { asStr, normalizeString } from "../util/strings.ts";
import { normalizeImage } from "./image.ts";
import { normalizeInstructions } from "./instructions.ts";
import { normalizeIngredients } from "./ingredients.ts";
import { normalizeAuthor } from "./author.ts";
import { normalizeYield } from "./yield.ts";
import { normalizeDuration } from "./duration.ts";
import { normalizeKeywords } from "./keywords.ts";
import { normalizeNutrition } from "./nutrition.ts";

const SCHEMA_ORG_PREFIX = "https://schema.org/";

function normalizeDiet(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  const items = Array.isArray(raw) ? raw : [raw];
  const result = items.map((d) => String(d).replace(SCHEMA_ORG_PREFIX, "").trim()).filter(Boolean);
  return result.length > 0 ? result : undefined;
}

function first(raw: unknown): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v !== undefined && v !== null ? asStr(v).trim() || undefined : undefined;
}

/**
 * Normalize a raw schema.org Recipe object into a validated Recipe.
 * Throws IngestError("INVALID_RECIPE") if required fields are missing or
 * the final output fails Zod validation.
 */
/**
 * @param context - Full JSON-LD payload (all root objects), used to resolve @id references
 *   that live outside the recipe node (e.g. Person defined at @graph level).
 */
export function normalizeRecipe(
  raw: unknown,
  _sourceUrl: string,
  context: unknown[] = [],
): { recipe: Recipe; warnings: IngestWarning[] } {
  const warnings: IngestWarning[] = [];

  if (!raw || typeof raw !== "object") {
    throw new IngestError("INVALID_RECIPE", "Recipe is not an object");
  }

  const o = raw as Record<string, unknown>;
  // Index the recipe itself AND the full outer context so @id refs across the graph resolve.
  const refs = buildRefIndex([...context, raw]);

  const name = normalizeString(asStr(o["name"]));
  if (!name) throw new IngestError("INVALID_RECIPE", "Recipe missing required field: name");

  const ingredients = normalizeIngredients(o["recipeIngredient"]);
  if (ingredients.length === 0)
    throw new IngestError("INVALID_RECIPE", "Recipe has no ingredients");

  const instructions = normalizeInstructions(o["recipeInstructions"]);
  if (instructions.length === 0) {
    warnings.push({
      code: "MISSING_FIELD",
      field: "recipeInstructions",
      message: "No instructions found",
    });
  }

  const recipe: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    recipeIngredient: ingredients,
    recipeInstructions: instructions,
  };

  const description = o["description"] ? normalizeString(asStr(o["description"])) : undefined;
  if (description) recipe["description"] = description;

  const image = normalizeImage(o["image"]);
  if (image !== undefined) recipe["image"] = image;

  const author = normalizeAuthor(o["author"], refs);
  if (author !== undefined) recipe["author"] = author;

  const datePublished = asStr(o["datePublished"]);
  if (datePublished) recipe["datePublished"] = datePublished;

  const recipeYield = normalizeYield(o["recipeYield"]);
  if (recipeYield !== undefined) recipe["recipeYield"] = recipeYield;

  const category = first(o["recipeCategory"]);
  if (category) recipe["recipeCategory"] = category;

  const cuisine = first(o["recipeCuisine"]);
  if (cuisine) recipe["recipeCuisine"] = cuisine;

  const keywords = normalizeKeywords(o["keywords"]);
  if (keywords?.length) recipe["keywords"] = keywords;

  const diet = normalizeDiet(o["suitableForDiet"]);
  if (diet?.length) recipe["suitableForDiet"] = diet;

  const prepTime = normalizeDuration(o["prepTime"], "prepTime", warnings);
  if (prepTime) recipe["prepTime"] = prepTime;

  const cookTime = normalizeDuration(o["cookTime"], "cookTime", warnings);
  if (cookTime) recipe["cookTime"] = cookTime;

  const totalTime = normalizeDuration(o["totalTime"], "totalTime", warnings);
  if (totalTime) recipe["totalTime"] = totalTime;

  const nutrition = normalizeNutrition(o["nutrition"]);
  if (nutrition) recipe["nutrition"] = nutrition;

  const parsed = recipeSchema.safeParse(recipe);
  if (!parsed.success) {
    throw new IngestError(
      "INVALID_RECIPE",
      `Recipe failed schema validation: ${JSON.stringify(parsed.error.issues)}`,
    );
  }

  return { recipe: parsed.data, warnings };
}
