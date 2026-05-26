import { z } from "zod";
import type { IngestContract, SiblingLocaleSource } from "@pixelmord/content-ai-ingest";
import { recipeSchema } from "recipe-ingestion";
import { ingredientSchema, pairingSchema } from "entity-kind";

// ── Recipe translation contract ────────────────────────────────────────────────
// Derived from recipeSchema via .pick().partial() — no manual field duplication.
// Copy-mode fields (prepTime, cookTime, totalTime, author, region) are handled
// client-side by the TranslateEntityDialog; they are NOT sent to the AI.

const recipeTranslationSchema = recipeSchema
  .pick({
    name: true,
    description: true,
    recipeCategory: true,
    recipeCuisine: true,
    recipeYield: true,
    keywords: true,
    recipeIngredient: true,
    recipeInstructions: true,
  })
  .partial()
  .extend({
    // Meta fields not in the Schema.org recipe schema:
    slug: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

export const recipeTranslationContract: IngestContract<
  typeof recipeTranslationSchema,
  SiblingLocaleSource
> = {
  schema: recipeTranslationSchema,
  systemPrompt:
    "You are a culinary content translator. Translate recipe fields accurately while maintaining culinary terminology and cultural nuance. For array fields (recipeIngredient, recipeInstructions, keywords, tags), translate each item individually and preserve the array structure.",
  async buildMessages(sourceContext) {
    const { sourceData, sourceLocale, targetLocale } = sourceContext;
    const lines = Object.entries(sourceData as Record<string, unknown>)
      .filter(([, v]) => v != null && (typeof v === "string" || Array.isArray(v)))
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n");
    return {
      prompt: `Translate the following recipe fields from ${sourceLocale.toUpperCase()} to ${targetLocale.toUpperCase()}. For array fields, translate each item individually and return the same JSON array structure. Output a JSON object with the same field names and translated values.\n\n${lines}`,
    };
  },
  fieldConfigs: {
    name: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    recipeCategory: { translation: { mode: "translate" } },
    recipeCuisine: { translation: { mode: "translate" } },
    slug: { translation: { mode: "translate" } },
    recipeYield: { translation: { mode: "localize" } },
    keywords: { translation: { mode: "localize" } },
    tags: { translation: { mode: "localize" } },
    recipeIngredient: { translation: { mode: "translate" } },
    recipeInstructions: { translation: { mode: "translate" } },
  },
};

// ── Ingredient translation contract ───────────────────────────────────────────
// Derived from ingredientSchema via .pick().partial() — prose fields only.
// Structural fields (botanicalName, region, images, …) are copy mode per the
// ingredient field config and not sent to the AI.

const ingredientTranslationSchema = ingredientSchema
  .pick({
    name: true,
    summary: true,
    description: true,
    culinaryUse: true,
    medicinalUses: true,
    healthBenefits: true,
    safetyNotes: true,
    history: true,
    storage: true,
    sourcing: true,
    seasonality: true,
  })
  .partial();

export const ingredientTranslationContract: IngestContract<
  typeof ingredientTranslationSchema,
  SiblingLocaleSource
> = {
  schema: ingredientTranslationSchema,
  systemPrompt:
    "You are a botanical and culinary content translator. Translate ingredient fields accurately, preserving scientific accuracy and cultural context.",
  async buildMessages(sourceContext) {
    const { sourceData, sourceLocale, targetLocale } = sourceContext;
    const lines = Object.entries(sourceData as Record<string, unknown>)
      .filter(([, v]) => v != null && typeof v === "string")
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    return {
      prompt: `Translate the following ingredient fields from ${sourceLocale.toUpperCase()} to ${targetLocale.toUpperCase()}. Output a JSON object with the same field names and translated values.\n\n${lines}`,
    };
  },
  fieldConfigs: {
    name: { translation: { mode: "translate" } },
    summary: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    culinaryUse: { translation: { mode: "translate" } },
    medicinalUses: { translation: { mode: "translate" } },
    healthBenefits: { translation: { mode: "translate" } },
    safetyNotes: { translation: { mode: "translate" } },
    history: { translation: { mode: "translate" } },
    storage: { translation: { mode: "translate" } },
    sourcing: { translation: { mode: "translate" } },
    seasonality: { translation: { mode: "translate" } },
  },
};

// ── Pairing translation contract ───────────────────────────────────────────────
// Derived from pairingSchema via .pick().partial().

const pairingTranslationSchema = pairingSchema.pick({ description: true }).partial();

export const pairingTranslationContract: IngestContract<
  typeof pairingTranslationSchema,
  SiblingLocaleSource
> = {
  schema: pairingTranslationSchema,
  systemPrompt:
    "You are a culinary content translator. Translate pairing descriptions accurately, preserving the editorial voice and culinary reasoning.",
  async buildMessages(sourceContext) {
    const { sourceData, sourceLocale, targetLocale } = sourceContext;
    const description =
      typeof (sourceData as Record<string, unknown>)["description"] === "string"
        ? ((sourceData as Record<string, unknown>)["description"] as string)
        : "";
    return {
      prompt: `Translate the following pairing description from ${sourceLocale.toUpperCase()} to ${targetLocale.toUpperCase()}. Output a JSON object with a "description" key.\n\ndescription: ${description}`,
    };
  },
  fieldConfigs: {
    description: { translation: { mode: "translate" } },
  },
};
