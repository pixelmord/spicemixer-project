import type { EntityKind } from "entity-kind";
import type { ContentStore } from "./content-store.ts";
import type { MetaRef } from "./meta-sidecar.ts";
import { createMetaSidecar } from "./meta-sidecar.ts";

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
  "culinaryUse",
  "flavorProfile",
  "images[0]",
] as const;

function scoreRecipe(recipe: AnyRecord, meta: AnyRecord): CompletenessResult {
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
 * Helper: resolve a pairing's description. In the folder-per-locale schema each
 * file carries a single `description` string — no locale key lookup needed.
 * The caller loads the correct locale file; this function just extracts the field.
 */
export function resolvePairingDescription(
  pairing: AnyRecord,
  locale: string,
): { description: string; locale: string; isFallback: boolean } {
  const description = typeof pairing["description"] === "string" ? pairing["description"] : "";
  return { description, locale, isFallback: false };
}

function scorePairing(pairing: AnyRecord): CompletenessResult {
  if (!has(pairing, "description")) return { score: 0, missing: ["description"], color: "red" };
  if (!has(pairing, "endpoints")) return { score: 0, missing: ["endpoints"], color: "red" };
  return { score: 100, missing: [], color: "green" };
}

function scoreIngredient(ingredient: AnyRecord): CompletenessResult {
  for (const field of INGREDIENT_REQUIRED) {
    if (!has(ingredient, field)) {
      return { score: 0, missing: [field], color: "red" };
    }
  }

  const missing: string[] = [];
  let filled = 0;

  for (const field of INGREDIENT_RECOMMENDED) {
    const key = field === "images[0]" ? "images" : field;
    if (has(ingredient, key)) {
      filled++;
    } else {
      missing.push(field);
    }
  }

  const pct = score(filled, INGREDIENT_RECOMMENDED.length);
  return { score: pct, missing, color: color(pct) };
}

/**
 * Pure completeness scorer. Dispatches on kind; accepts pre-fetched content and meta blobs.
 * For pairings, pass locale in meta (defaults to "en").
 */
export function computeCompletenessFromBlob(
  kind: EntityKind,
  content: AnyRecord,
  meta: AnyRecord,
): CompletenessResult {
  switch (kind) {
    case "recipe":
      return scoreRecipe(content, meta);
    case "ingredient":
      return scoreIngredient(content);
    case "pairing":
      return scorePairing(content);
  }
}

/**
 * Caller-facing completeness scorer. Fetches content and meta from the store via MetaSidecar,
 * then delegates to computeCompletenessFromBlob.
 */
export async function computeCompleteness(
  kind: EntityKind,
  ref: MetaRef,
  store: ContentStore,
): Promise<CompletenessResult> {
  const contentId = ref.locale ? `${ref.locale}/${ref.slug}` : ref.slug;
  const sidecar = createMetaSidecar(store);
  const [contentItem, metaItem] = await Promise.all([
    store.get(ref.collection, contentId),
    sidecar.read(ref),
  ]);
  const content = (contentItem?.data ?? {}) as AnyRecord;
  const meta = (metaItem?.data ?? {}) as AnyRecord;
  return computeCompletenessFromBlob(kind, content, meta);
}
