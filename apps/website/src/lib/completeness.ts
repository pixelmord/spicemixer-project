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

export const INGREDIENT_REQUIRED = ["name", "category", "summary"] as const;
export const INGREDIENT_RECOMMENDED = [
  "description",
  "botanicalName",
  "family",
  "origin",
  "parts",
  "flavorProfile",
  "images",
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

/**
 * Helper: resolve a pairing's description for a given locale with fallback.
 * Returns { description, locale, isFallback }.
 */
export function resolvePairingDescription(
  pairing: AnyRecord,
  locale: string,
): { description: string; locale: string; isFallback: boolean } {
  const descriptions = (pairing["descriptions"] as Record<string, string> | undefined) ?? {};
  if (descriptions[locale]) return { description: descriptions[locale], locale, isFallback: false };
  if (descriptions["en"])
    return { description: descriptions["en"], locale: "en", isFallback: true };
  const firstKey = Object.keys(descriptions)[0];
  if (firstKey) return { description: descriptions[firstKey], locale: firstKey, isFallback: true };
  // Legacy single-description field
  const legacy = String(pairing["description"] ?? "");
  return { description: legacy, locale: "en", isFallback: !!legacy };
}

export function scorePairing(pairing: AnyRecord, locale: string): CompletenessResult {
  const descriptions = (pairing["descriptions"] as Record<string, string> | undefined) ?? {};
  const legacy = pairing["description"] ? "en" : null;
  const hasAny = Object.keys(descriptions).length > 0 || legacy;

  if (!hasAny) return { score: 0, missing: ["descriptions"], color: "red" };

  const missing: string[] = [];
  const recommended = ["en", "de"];
  let filled = 0;

  for (const lang of recommended) {
    if (descriptions[lang] || (lang === "en" && legacy)) {
      filled++;
    } else {
      missing.push(`description.${lang}`);
    }
  }

  if (!descriptions[locale] && !(locale === "en" && legacy)) {
    // Ensure current locale is in missing
    if (!missing.includes(`description.${locale}`)) missing.unshift(`description.${locale}`);
  }

  const pct = score(filled, recommended.length);
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
