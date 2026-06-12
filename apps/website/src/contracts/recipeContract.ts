import { z } from "zod";
import { recipeSchema } from "recipe-ingestion";
import type { AiContract, FieldConfig } from "@pixelmord/content-ai-refine";
import { commonPresets, excludeExistingValuesRule } from "./_shared.ts";
import { localeToLanguageName } from "./locale-language.ts";

type RecipeSchema = typeof recipeSchema;

// Context for recipe refine operations
export interface RecipeRefineContext {
  inventory?: Array<{ slug: string; name: string }>;
  existingTags?: string[];
  existingRecipes?: Array<{
    collection: "recipes" | "mixtures";
    slug: string;
    name: string;
    recipeIngredient?: string[];
  }>;
  locale?: string;
}

function buildRecipeCtx(
  currentData: z.infer<RecipeSchema> | undefined,
  maxIngredients = 8,
): string {
  if (!currentData) return "";
  return [
    `Name: ${currentData.name}`,
    currentData.description ? `Description: ${currentData.description}` : null,
    currentData.recipeCategory ? `Category: ${currentData.recipeCategory}` : null,
    currentData.recipeCuisine ? `Cuisine: ${currentData.recipeCuisine}` : null,
    Array.isArray(currentData.recipeIngredient) && currentData.recipeIngredient.length
      ? `Key ingredients: ${currentData.recipeIngredient.slice(0, maxIngredients).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// Text improvement field helper (replaces proposeRecipeImprovements per-field)
const textFieldConfig = (instruction: string): FieldConfig<RecipeSchema, RecipeRefineContext> => ({
  systemPrompt: ({ currentData, sourceContext }) => {
    const ctx = buildRecipeCtx(currentData);
    const locale = sourceContext?.locale ?? "en";
    const languageName = localeToLanguageName(locale);
    return `You are a culinary recipe editor.

Recipe context:
${ctx}

${instruction}

Rules:
- Write the output in ${languageName}. Do not use any other language.
- Be specific and informative
- For time fields use ISO 8601 duration format (e.g. "PT15M", "PT1H30M")
- Do NOT suggest image URLs`;
  },
  autoApply: { policy: "never" },
  presetIds: ["expand", "summarize"],
  translation: { mode: "translate" },
  writePolicy: "replace",
});

// Ingredient links output schema (replaces proposeIngredientLinks)
const ingredientLinksOutputSchema = z.array(
  z.object({
    pattern: z.string(),
    slug: z.string(),
    confidence: z.string(),
  }),
);

// Tags output schema (replaces proposeTags)
const tagsOutputSchema = z.array(z.string());

// Pairings output schema — each item seeds a new Pairing entity on accept.
const pairingsOutputSchema = z.array(
  z.object({
    otherCollection: z.enum(["ingredients", "mixtures", "recipes"]),
    otherSlug: z.string(),
    rationale: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  }),
);

export const recipeContract: AiContract<RecipeSchema, RecipeRefineContext> = {
  schema: recipeSchema,
  presets: commonPresets,
  fields: {
    description: textFieldConfig("Write a detailed description of this recipe."),
    recipeCategory: textFieldConfig(
      "Suggest an appropriate recipe category (e.g. 'Main Course', 'Appetizer', 'Dessert').",
    ),
    recipeCuisine: textFieldConfig(
      "Suggest the cuisine type for this recipe (e.g. 'Italian', 'Japanese', 'Moroccan').",
    ),
    name: textFieldConfig("Write a clear, appealing name for this recipe."),

    // Schema.org keywords field — searchable/SEO-oriented tags on the recipe content
    keywords: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const ctx = buildRecipeCtx(currentData);
        const locale = sourceContext?.locale ?? "en";
        const languageName = localeToLanguageName(locale);
        const existingTags = sourceContext?.existingTags ?? [];
        const tagHints = existingTags.length
          ? `Prefer tags from this existing vocabulary where applicable:\n${existingTags.slice(0, 60).join(", ")}`
          : "";
        const existing = Array.isArray(currentData?.keywords) ? currentData.keywords : [];
        const exclude = excludeExistingValuesRule(existing);
        return `Suggest 3–8 concise Schema.org keywords for this recipe. Keywords should be lowercase, hyphenated if multi-word. Focus on searchability and schema.org markup.
IMPORTANT: All keywords MUST be in ${languageName}. Do not use any other language.

${ctx}
${tagHints}

${exclude}`;
      },
      outputSchema: tagsOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "localize" },
      bulk: true,
    },

    // Editorial tags field — SpiceMixer metadata tags for categorisation and browsing
    tags: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const ctx = buildRecipeCtx(currentData);
        const locale = sourceContext?.locale ?? "en";
        const languageName = localeToLanguageName(locale);
        return `Suggest 3–5 editorial tags for categorising this recipe in SpiceMixer. Focus on meal occasion, cooking style, and dietary preferences. Tags should be lowercase, hyphenated if multi-word.
IMPORTANT: All tags MUST be in ${languageName}. Do not use any other language.

${ctx}`;
      },
      outputSchema: tagsOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "localize" },
      bulk: true,
    },

    // Ingredient links (replaces proposeIngredientLinks)
    ingredientLinks: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const inventory = sourceContext?.inventory ?? [];
        if (!inventory.length) return "";
        const recipeIngredients = Array.isArray(currentData?.recipeIngredient)
          ? currentData.recipeIngredient
          : [];
        if (!recipeIngredients.length) return "";
        const inventorySet = new Set(inventory.map((i) => i.slug));
        const inventoryList = inventory.map((i) => `${i.slug}: ${i.name}`).join("\n");
        return `Match each recipe ingredient string to the best slug from the inventory below.

IMPORTANT: Only use slugs that appear verbatim in the inventory list. Do not invent or guess slugs.

Recipe ingredients:
${recipeIngredients.map((i: string, n: number) => `${n + 1}. ${i}`).join("\n")}

Ingredient inventory (slug: name):
${inventoryList}

For each ingredient that has a clear match, return:
- pattern: a lowercase substring of the ingredient string that identifies the ingredient
- slug: the exact matching slug from the inventory list above
- confidence: high / medium / low

Return an empty array if nothing matches confidently. Do not fabricate slugs.

Valid slugs: ${[...inventorySet].join(", ")}`;
      },
      outputSchema: ingredientLinksOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "copy" },
      bulk: true,
    },

    // Language detection (replaces detectLanguage)
    // threshold: 0.0 auto-applies any confidence level
    language: {
      systemPrompt: ({ currentData }) => {
        const text = [currentData?.name, currentData?.description]
          .filter(Boolean)
          .map(String)
          .join(" — ")
          .slice(0, 500);
        return `Identify the language of the following text and return its ISO 639-1 two-letter code (e.g. "en", "de", "fr").

Text: "${text}"`;
      },
      outputSchema: z.string().length(2),
      autoApply: { policy: "high-confidence", threshold: 0.0 },
      translation: { mode: "copy" },
      writePolicy: "fill-if-empty",
      bulk: true,
    },

    // Slug proposal (replaces proposeSlug)
    slug: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const locale = sourceContext?.locale ?? "en";
        return `Generate a clean URL slug for the recipe name below. Rules:
- Lowercase only
- Hyphens as separators (no underscores)
- Transliterate or translate non-ASCII characters to their Latin equivalents
- Keep it short (2-5 words max)
- No stop words unless they aid clarity
- Locale hint: ${locale}

Recipe name: "${currentData?.name ?? ""}"`;
      },
      outputSchema: z.string(),
      autoApply: { policy: "never" },
      translation: { mode: "translate" },
    },

    // rationale becomes the new Pairing's description on accept.
    pairings: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const inventory = sourceContext?.inventory ?? [];
        const existingRecipes = sourceContext?.existingRecipes ?? [];
        if (!inventory.length && !existingRecipes.length) return "";
        const ctx = buildRecipeCtx(currentData);
        const allEntities = [
          ...inventory.map((i) => `[ingredients] ${i.slug}: ${i.name}`),
          ...existingRecipes.map((r) => `[${r.collection}] ${r.slug}: ${r.name}`),
        ];
        return `Suggest pairings for this recipe or mixture. A pairing is a strong culinary affinity that warrants editorial commentary — complementary flavor profiles, shared regional heritage, or one enhancing the other.

Current entity:
${ctx}

Available entities ([collection] slug: name):
${allEntities.slice(0, 80).join("\n")}

Return up to 4 pairings. For each:
- otherCollection: the collection of the other entity (ingredients / mixtures / recipes)
- otherSlug: exact slug from the list above
- rationale: 1-2 sentences explaining the culinary affinity — this becomes the pairing description
- confidence: high / medium / low

Only suggest pairings with clear culinary logic. Return empty array if nothing fits strongly.`;
      },
      outputSchema: pairingsOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "copy" },
      bulk: true,
    },
  },
};
