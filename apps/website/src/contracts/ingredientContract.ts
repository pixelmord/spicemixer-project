import { z } from "zod";
import { ingredientSchema } from "entity-kind";
import type { AiContract, FieldConfig } from "@pixelmord/content-ai-refine";

type IngredientSchema = typeof ingredientSchema;

// Context passed from the action handler so prompts can reference the inventory.
export interface IngredientRefineContext {
  inventory?: Array<{
    slug: string;
    name: string;
    collection?: "ingredients" | "mixtures" | "recipes";
  }>;
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

// Array string output for tag-like fields (origin, flavorNotes).
const stringArrayOutputSchema = z.array(z.string());

// Pairing proposals field — each item seeds a new Pairing entity on accept.
// confidence is retained here (not surfaced to UI) so the runner can auto-apply high-confidence items.
const pairingsOutputSchema = z.array(
  z.object({
    otherCollection: z.enum(["ingredients", "mixtures", "recipes"]),
    otherSlug: z.string(),
    rationale: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  }),
);

export const ingredientContract: AiContract<IngredientSchema, IngredientRefineContext> = {
  schema: ingredientSchema,
  presets,
  fields: {
    summary: textFieldConfig("Write a concise 1-2 sentence summary of this ingredient."),
    description: textFieldConfig(
      "Write a detailed encyclopedia-style description of this ingredient.",
    ),
    culinaryUse: textFieldConfig("Describe how this ingredient is used in cooking and cuisine."),
    medicinalUses: textFieldConfig(
      "Describe traditional and documented medicinal uses of this ingredient.",
    ),
    healthBenefits: textFieldConfig(
      "Describe the health benefits of this ingredient based on available research.",
    ),
    safetyNotes: textFieldConfig(
      "Describe any safety considerations, contraindications, or warnings for this ingredient.",
    ),
    history: textFieldConfig("Describe the history and cultural significance of this ingredient."),
    storage: textFieldConfig("Describe how to properly store this ingredient."),
    sourcing: textFieldConfig(
      "Describe how to source and select high-quality versions of this ingredient.",
    ),
    seasonality: textFieldConfig("Describe the seasonal availability of this ingredient."),

    // Geographic origins (string[]) — typically untranslated proper nouns.
    origin: {
      systemPrompt: ({ currentData }) => {
        const ctx = buildIngredientCtx(currentData);
        return `You are a culinary geographer. Suggest 1–5 primary geographic origin regions for this ingredient (countries or distinctive regions), favoring the most authoritative or historically associated areas.

Ingredient context:
${ctx}

Rules:
- Return concise place names (e.g. "Iran", "Guatemala", "Sichuan").
- Prefer the historically/agriculturally dominant origins; do not over-list.
- Do not include continents unless that is the most specific accurate level.`;
      },
      outputSchema: stringArrayOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "copy" },
    },

    // Flavor descriptors (string[]) — localizable adjectives.
    flavorNotes: {
      systemPrompt: ({ currentData }) => {
        const ctx = buildIngredientCtx(currentData);
        return `Suggest 3–7 concise flavor descriptors for this ingredient.

Ingredient context:
${ctx}

Rules:
- Lowercase single words or short hyphenated phrases (e.g. "floral", "earthy", "warm", "citrus-peel").
- Cover the dominant tasting notes a cook would notice.
- No duplicates, no generic words like "tasty" or "good".`;
      },
      outputSchema: stringArrayOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "localize" },
    },

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

    // outputSchema differs from entity schema; rationale becomes the new Pairing's description.
    pairings: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const ctx = buildIngredientCtx(currentData);
        const inventory = sourceContext?.inventory ?? [];
        if (!inventory.length) return "";
        const inventoryList = inventory
          .map((i) => `[${i.collection ?? "ingredients"}] ${i.slug}: ${i.name}`)
          .join("\n");
        return `You are a culinary expert. Suggest pairings for this spice/ingredient with other spices, mixtures, or recipes.
Only select slugs that exist verbatim in the inventory. Do not invent slugs.

Ingredient:
${ctx}

Inventory ([collection] slug: name):
${inventoryList}

Return up to 6 pairings. For each:
- otherCollection: the collection of the other entity (ingredients / mixtures / recipes)
- otherSlug: exact slug from the inventory for that collection
- rationale: 1-2 sentences explaining why they pair well (culinary reason, flavor harmony) — this becomes the pairing description
- confidence: high / medium / low`;
      },
      outputSchema: pairingsOutputSchema,
      autoApply: { policy: "never" },
      translation: { mode: "copy" },
    },
  },
};
