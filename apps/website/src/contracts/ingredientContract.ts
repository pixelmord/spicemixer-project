import { z } from "zod";
import { ingredientSchema } from "entity-kind";
import type { AiContract, FieldConfig } from "content-ai-refine";

type IngredientSchema = typeof ingredientSchema;

// Context passed from the action handler so prompts can reference the inventory.
export interface IngredientRefineContext {
  inventory?: Array<{ slug: string; name: string }>;
  locale?: string;
}

function buildIngredientCtx(currentData: z.infer<IngredientSchema> | undefined): string {
  if (!currentData) return "";
  return [
    `Name: ${currentData.name}`,
    currentData.category ? `Category: ${currentData.category}` : null,
    currentData.flavorNotes?.length ? `Flavor notes: ${currentData.flavorNotes.join(", ")}` : null,
    currentData.origin?.length ? `Origins: ${currentData.origin.join(", ")}` : null,
    currentData.summary ? `Summary: ${currentData.summary}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// Presets available on ingredient fields.
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

// Prose improvement fields (replacing proposeIngredientImprovements)
const textFieldConfig = (
  fieldLabel: string,
  instruction: string,
): FieldConfig<IngredientSchema, IngredientRefineContext> => ({
  systemPrompt: ({ currentData }) => {
    const ctx = buildIngredientCtx(currentData);
    return `You are a culinary encyclopedia editor specializing in spices and ingredients.

Ingredient context:
${ctx}

${instruction}

Rules:
- Be specific and informative, drawing on culinary knowledge
- Avoid placeholder or generic content
- Do NOT suggest image URLs`;
  },
  autoApply: { policy: "never" },
  presetIds: ["expand", "summarize"],
  translation: { mode: "translate" },
  writePolicy: "replace",
});

// Pairing proposals field (replacing proposeIngredientPairings)
const pairingsOutputSchema = z.array(
  z.object({
    slug: z.string(),
    description: z.string(),
    confidence: z.string(),
  }),
);

export const ingredientContract: AiContract<IngredientSchema, IngredientRefineContext> = {
  schema: ingredientSchema,
  presets,
  fields: {
    summary: textFieldConfig("summary", "Write a concise 1-2 sentence summary of this ingredient."),
    description: textFieldConfig(
      "description",
      "Write a detailed encyclopedia-style description of this ingredient.",
    ),
    culinaryUse: textFieldConfig(
      "culinaryUse",
      "Describe how this ingredient is used in cooking and cuisine.",
    ),
    medicinalUses: textFieldConfig(
      "medicinalUses",
      "Describe traditional and documented medicinal uses of this ingredient.",
    ),
    healthBenefits: textFieldConfig(
      "healthBenefits",
      "Describe the health benefits of this ingredient based on available research.",
    ),
    safetyNotes: textFieldConfig(
      "safetyNotes",
      "Describe any safety considerations, contraindications, or warnings for this ingredient.",
    ),
    history: textFieldConfig(
      "history",
      "Describe the history and cultural significance of this ingredient.",
    ),
    storage: textFieldConfig("storage", "Describe how to properly store this ingredient."),
    sourcing: textFieldConfig(
      "sourcing",
      "Describe how to source and select high-quality versions of this ingredient.",
    ),
    seasonality: textFieldConfig(
      "seasonality",
      "Describe the seasonal availability of this ingredient.",
    ),
    // Language detection — replaces detectLanguage for ingredients
    language: {
      systemPrompt: ({ currentData }) => {
        const text = [currentData?.name, currentData?.summary, currentData?.description]
          .filter(Boolean)
          .map(String)
          .join(" — ")
          .slice(0, 500);
        return `Identify the language of the following text and return its ISO 639-1 two-letter code (e.g. "en", "de", "fr").

Text: "${text}"`;
      },
      outputSchema: z.string().length(2),
      autoApply: { policy: "high-confidence" as const, threshold: 0.0 },
      translation: { mode: "copy" as const },
      writePolicy: "fill-if-empty" as const,
    },

    // Pairing proposals — replaces proposeIngredientPairings
    // outputSchema differs from entity schema (includes description + confidence)
    // autoApply is "never" here; high-confidence auto-creation of pairing entities
    // is handled by the caller (runAiRefresh / action handlers).
    pairings: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const ctx = buildIngredientCtx(currentData);
        const inventory = sourceContext?.inventory ?? [];
        if (!inventory.length) return "";
        const inventoryList = inventory.map((i) => `${i.slug}: ${i.name}`).join("\n");
        return `You are a culinary expert. Suggest ingredient pairings for this spice/ingredient.
Only select slugs that exist verbatim in the inventory. Do not invent slugs.

Ingredient:
${ctx}

Inventory (slug: name):
${inventoryList}

Return up to 6 pairings. For each:
- slug: exact slug from the inventory
- description: 1-2 sentences explaining why they pair well (culinary reason, flavor harmony)
- confidence: high / medium / low`;
      },
      outputSchema: pairingsOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "copy" },
    },
  },
};
