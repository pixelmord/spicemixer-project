import { z } from "zod";
import { recipeSchema } from "recipe-ingestion";
import type { AiContract, FieldConfig } from "@pixelmord/content-ai-refine";

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

const presets = [
  {
    id: "expand",
    label: "Expand",
    description: "Expand the content with more detail.",
    instruction: "Write in more detail, adding depth and nuance.",
    appliesTo: "text" as const,
    autoApplyOverride: { policy: "never" as const },
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Shorten the content.",
    instruction: "Write a concise version without losing key points.",
    appliesTo: "text" as const,
    autoApplyOverride: { policy: "never" as const },
  },
];

// Text improvement field helper (replaces proposeRecipeImprovements per-field)
const textFieldConfig = (instruction: string): FieldConfig<RecipeSchema, RecipeRefineContext> => ({
  systemPrompt: ({ currentData }) => {
    const ctx = buildRecipeCtx(currentData);
    return `You are a culinary recipe editor.

Recipe context:
${ctx}

${instruction}

Rules:
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

// Relations output schema (replaces proposeRelations)
const relationsOutputSchema = z.array(
  z.object({
    kind: z.enum(["goesWellWith", "usesBase"]),
    collection: z.enum(["recipes", "mixtures"]),
    slug: z.string(),
    name: z.string(),
    rationale: z.string(),
  }),
);

// Tags output schema (replaces proposeTags)
const tagsOutputSchema = z.array(z.string());

export const recipeContract: AiContract<RecipeSchema, RecipeRefineContext> = {
  schema: recipeSchema,
  presets,
  fields: {
    description: textFieldConfig("Write a detailed description of this recipe."),
    recipeCategory: textFieldConfig(
      "Suggest an appropriate recipe category (e.g. 'Main Course', 'Appetizer', 'Dessert').",
    ),
    recipeCuisine: textFieldConfig(
      "Suggest the cuisine type for this recipe (e.g. 'Italian', 'Japanese', 'Moroccan').",
    ),
    name: textFieldConfig("Write a clear, appealing name for this recipe."),

    // Tags / keywords (replaces proposeTags)
    keywords: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const ctx = buildRecipeCtx(currentData);
        const existingTags = sourceContext?.existingTags ?? [];
        const tagHints = existingTags.length
          ? `Prefer tags from this existing vocabulary where applicable:\n${existingTags.slice(0, 60).join(", ")}`
          : "";
        return `Suggest 3–8 concise tags for this recipe. Tags should be lowercase, hyphenated if multi-word (e.g. "quick-dinner", "vegan", "spicy").

${ctx}
${tagHints}`;
      },
      outputSchema: tagsOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "localize" },
    },

    // Ingredient links (replaces proposeIngredientLinks)
    // autoApply "never" — caller handles high-confidence auto-apply to meta.ingredientLinks
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
    },

    // Relation proposals (replaces proposeRelations)
    relations: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const existingRecipes = sourceContext?.existingRecipes ?? [];
        if (!existingRecipes.length) return "";
        const ctx = buildRecipeCtx(currentData);
        const candidatesList = existingRecipes
          .slice(0, 50)
          .map((r) => `${r.collection}/${r.slug}: ${r.name}`)
          .join("\n");
        return `Based on this recipe, suggest related recipes from the catalog below.

Current recipe:
${ctx}

Available recipes (collection/slug: name):
${candidatesList}

Return up to 4 relations:
- "goesWellWith": recipes this pairs or serves well alongside
- "usesBase": recipes/mixtures this recipe uses as a base ingredient

Only suggest relations with clear culinary logic. Return empty array if nothing fits.`;
      },
      outputSchema: relationsOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "copy" },
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
  },
};
