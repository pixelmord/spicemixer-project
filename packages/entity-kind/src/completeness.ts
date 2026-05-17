export interface CompletenessResult {
  score: number;
  missing: string[];
  color: "green" | "amber" | "red";
}

export interface CompletenessModel {
  required: readonly string[];
  recommended: readonly string[];
  score: (entity: Record<string, unknown>, ctx?: Record<string, unknown>) => CompletenessResult;
}

type AnyRecord = Record<string, unknown>;

function has(obj: AnyRecord, key: string): boolean {
  const v = obj[key];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function toPct(filled: number, total: number): number {
  return total === 0 ? 100 : Math.round((filled / total) * 100);
}

function toColor(pct: number): "green" | "amber" | "red" {
  if (pct >= 80) return "green";
  if (pct >= 40) return "amber";
  return "red";
}

// ── Ingredient ────────────────────────────────────────────────────────────────

export const INGREDIENT_REQUIRED = ["name", "category", "summary"] as const;
export const INGREDIENT_RECOMMENDED = [
  "description",
  "botanicalName",
  "family",
  "origin",
  "parts",
  "culinaryUse",
  "flavorProfile",
  "images[0]",
] as const;

export function scoreIngredient(ingredient: AnyRecord): CompletenessResult {
  for (const field of INGREDIENT_REQUIRED) {
    if (!has(ingredient, field)) return { score: 0, missing: [field], color: "red" };
  }
  const missing: string[] = [];
  let filled = 0;
  for (const field of INGREDIENT_RECOMMENDED) {
    const key = field === "images[0]" ? "images" : field;
    if (has(ingredient, key)) filled++;
    else missing.push(field);
  }
  const pct = toPct(filled, INGREDIENT_RECOMMENDED.length);
  return { score: pct, missing, color: toColor(pct) };
}

// ── Recipe ────────────────────────────────────────────────────────────────────

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

export function scoreRecipe(recipe: AnyRecord, meta: AnyRecord = {}): CompletenessResult {
  for (const field of RECIPE_REQUIRED) {
    const v = recipe[field];
    if (!v || (Array.isArray(v) && v.length === 0))
      return { score: 0, missing: [field], color: "red" };
  }
  const missing: string[] = [];
  let filled = 0;
  for (const field of RECIPE_RECOMMENDED) {
    if (has(recipe, field)) filled++;
    else missing.push(field);
  }
  const hasIngredientLinks =
    Array.isArray(meta["ingredientLinks"]) && meta["ingredientLinks"].length > 0;
  const total = RECIPE_RECOMMENDED.length + 1;
  if (hasIngredientLinks) filled++;
  else missing.push("meta.ingredientLinks");
  const pct = toPct(filled, total);
  return { score: pct, missing, color: toColor(pct) };
}

// ── Pairing ───────────────────────────────────────────────────────────────────

export const PAIRING_REQUIRED = ["description", "endpoints"] as const;
export const PAIRING_RECOMMENDED = [] as const;

export function scorePairing(pairing: AnyRecord): CompletenessResult {
  if (!has(pairing, "description")) return { score: 0, missing: ["description"], color: "red" };
  if (!has(pairing, "endpoints")) return { score: 0, missing: ["endpoints"], color: "red" };
  return { score: 100, missing: [], color: "green" };
}
