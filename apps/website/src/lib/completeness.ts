/**
 * Completeness scoring for content items.
 * Returns a 0–100 integer score and a list of missing recommended fields.
 */
export interface CompletenessResult {
  score: number;
  missing: string[];
  color: "green" | "amber" | "red";
}

type AnyRecord = Record<string, unknown>;

function has(obj: AnyRecord, key: string): boolean {
  const v = obj[key];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function score(filled: number, total: number): number {
  return total === 0 ? 100 : Math.round((filled / total) * 100);
}

function color(pct: number): "green" | "amber" | "red" {
  if (pct >= 80) return "green";
  if (pct >= 40) return "amber";
  return "red";
}

export const RECIPE_REQUIRED = ["name", "recipeIngredient", "recipeInstructions"] as const;
export const RECIPE_RECOMMENDED = [
  "description",
  "image",
  "author",
  "recipeYield",
  "prepTime",
  "cookTime",
  "totalTime",
  "recipeCategory",
  "recipeCuisine",
  "keywords",
  "datePublished",
] as const;

export const INGREDIENT_REQUIRED = ["name", "category"] as const;
export const INGREDIENT_RECOMMENDED = [
  "summary",
  "description",
  "image",
  "origin",
  "flavorNotes",
  "pairings",
] as const;

export function scoreRecipe(recipe: AnyRecord, meta: AnyRecord): CompletenessResult {
  // Required — missing any → score 0
  for (const field of RECIPE_REQUIRED) {
    const v = recipe[field];
    if (!v || (Array.isArray(v) && v.length === 0)) {
      return { score: 0, missing: [field], color: "red" };
    }
  }

  const missing: string[] = [];
  let filled = 0;

  for (const field of RECIPE_RECOMMENDED) {
    if (has(recipe, field)) {
      filled++;
    } else {
      missing.push(field);
    }
  }

  // Bonus recommended from meta
  const hasIngredientLinks = Array.isArray(meta.ingredientLinks) && meta.ingredientLinks.length > 0;
  const total = RECIPE_RECOMMENDED.length + 1; // +1 for ingredientLinks
  if (hasIngredientLinks) {
    filled++;
  } else {
    missing.push("meta.ingredientLinks");
  }

  const pct = score(filled, total);
  return { score: pct, missing, color: color(pct) };
}

export function scoreIngredient(ingredient: AnyRecord): CompletenessResult {
  for (const field of INGREDIENT_REQUIRED) {
    if (!has(ingredient, field)) {
      return { score: 0, missing: [field], color: "red" };
    }
  }

  const missing: string[] = [];
  let filled = 0;

  for (const field of INGREDIENT_RECOMMENDED) {
    if (has(ingredient, field)) {
      filled++;
    } else {
      missing.push(field);
    }
  }

  const pct = score(filled, INGREDIENT_RECOMMENDED.length);
  return { score: pct, missing, color: color(pct) };
}
