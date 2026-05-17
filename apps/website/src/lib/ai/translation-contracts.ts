import { z } from "zod";
import type { IngestContract, SiblingLocaleSource } from "@pixelmord/content-ai-ingest";

// ── Recipe translation contract ────────────────────────────────────────────────
// Covers the prose / label fields that need LLM translation for recipes and
// mixtures. Structural / URL / duration fields (recipeYield, prepTime, …) are
// handled by copy mode in fieldConfigs.

const recipeTranslationSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  recipeCategory: z.string().optional(),
  recipeCuisine: z.string().optional(),
  slug: z.string().optional(),
});

export const recipeTranslationContract: IngestContract<
  typeof recipeTranslationSchema,
  SiblingLocaleSource
> = {
  schema: recipeTranslationSchema,
  systemPrompt:
    "You are a culinary content translator. Translate recipe fields accurately while maintaining culinary terminology and cultural nuance.",
  async buildMessages(sourceContext) {
    const { sourceData, sourceLocale, targetLocale } = sourceContext;
    const lines = Object.entries(sourceData as Record<string, unknown>)
      .filter(([, v]) => v != null && typeof v === "string")
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    return {
      prompt: `Translate the following recipe fields from ${sourceLocale.toUpperCase()} to ${targetLocale.toUpperCase()}. Output a JSON object with the same field names and translated values.\n\n${lines}`,
    };
  },
  fieldConfigs: {
    name: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    recipeCategory: { translation: { mode: "translate" } },
    recipeCuisine: { translation: { mode: "translate" } },
    slug: { translation: { mode: "translate" } },
  },
};

// ── Ingredient translation contract ───────────────────────────────────────────
// Prose fields only. Structural fields (botanicalName, region, images, …) are
// copy mode per the ingredient field config.

const ingredientTranslationSchema = z.object({
  name: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  culinaryUse: z.string().optional(),
  medicinalUses: z.string().optional(),
  healthBenefits: z.string().optional(),
  safetyNotes: z.string().optional(),
  history: z.string().optional(),
  storage: z.string().optional(),
  sourcing: z.string().optional(),
  seasonality: z.string().optional(),
});

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

const pairingTranslationSchema = z.object({
  description: z.string().optional(),
});

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
