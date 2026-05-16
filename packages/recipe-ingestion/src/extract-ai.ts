import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { z } from "zod";

// Extraction schema — simpler than the full schema.org shape, optimised for LLM output.
const recipeAiExtractSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  recipeYield: z.string().optional(),
  prepTime: z.string().optional(),
  cookTime: z.string().optional(),
  totalTime: z.string().optional(),
  recipeCategory: z.string().optional(),
  recipeCuisine: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  recipeIngredient: z.array(z.string()),
  recipeInstructions: z.array(z.object({ text: z.string(), name: z.string().optional() })),
});

export type RecipeAiExtract = z.infer<typeof recipeAiExtractSchema>;

export interface AiExtractionResult {
  recipe: RecipeAiExtract;
  warnings: string[];
}

const RECIPE_AI_SYSTEM_PROMPT = `You are a culinary data extractor. Given text about a recipe, extract it into a structured JSON object.

LANGUAGE — non-negotiable:
- Preserve the source language exactly. Never translate.
- Copy ingredient strings, instruction steps, name, and description VERBATIM from the source.
- The only fields you may normalize are times (to ISO 8601) and structural splitting (one ingredient per array entry, one step per array entry).

Extraction rules:
- List each ingredient as a separate string in recipeIngredient
- List each instruction step as a separate object in recipeInstructions with a text field
- Times should be in ISO 8601 duration format (e.g. "PT30M", "PT1H15M") if parseable, otherwise omit
- Extract keywords as individual tags, not comma-separated strings
- If a field is not present in the source, omit it`;

type TextSource = { kind: "text"; content: string };

const recipeAiContract: IngestContract<typeof recipeAiExtractSchema, TextSource> = {
  schema: recipeAiExtractSchema,
  systemPrompt: RECIPE_AI_SYSTEM_PROMPT,
  buildMessages: async (source) => ({
    prompt: `Extract the recipe from the following text:\n\n${source.content}`,
  }),
};

/**
 * Extract a recipe from plain text using AI (runFill).
 * Complements fetchRecipe (JSON-LD extraction) for sources that lack structured data.
 */
export async function extractRecipeFromText(
  content: string,
  config: AiConfig,
): Promise<AiExtractionResult> {
  const result = await runFill({
    contract: recipeAiContract,
    sourceContext: { kind: "text", content },
    config,
  });

  const recipe: Record<string, unknown> = {};
  for (const [field, suggestion] of result.suggestions) {
    if (suggestion.kind === "single") recipe[field] = suggestion.value;
  }

  return { recipe: recipe as RecipeAiExtract, warnings: result.warnings };
}
