import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { toImagePart } from "@/lib/image.ts";
import { extractPdfContent } from "@/lib/pdf.ts";
import { recipeExtractSchema, type RecipeExtract } from "@/contracts/schemas/recipe-extract.ts";

export type RecipeFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

export interface ExtractOptions {
  debug?: boolean;
}

export interface RecipeExtractionResult {
  recipe: RecipeExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

// Resolved input after PDF pre-processing
type ResolvedInput =
  | { kind: "text"; content: string }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "pdf-vision"; bytes: Uint8Array };

const RECIPE_SYSTEM_PROMPT = `You are a culinary data extractor. Given text or an image of a recipe, extract it into a structured JSON object.

LANGUAGE — non-negotiable:
- Preserve the source language exactly. If the source is in German, output German; if French, output French; etc. Never translate.
- Copy ingredient strings, instruction steps, name, description, and keywords VERBATIM from the source. Do not paraphrase, summarize, shorten, or rewrite. Keep the author's exact wording, including units, brand names, and idiomatic phrasing.
- The only fields you may normalize are times (to ISO 8601) and structural splitting (one ingredient per array entry, one step per array entry).

Extraction rules:
- List each ingredient as a separate string in recipeIngredient (e.g. "2 cups flour", "1 tsp salt") — using the source's original wording and units
- List each instruction step as a separate object in recipeInstructions, preserving the original sentences
- Times should be in ISO 8601 duration format (e.g. "PT30M", "PT1H15M") if parseable, otherwise leave empty
- Extract keywords as individual tags, not comma-separated strings — keep them in the source language
- If a field is not present in the source, omit it`;

const recipeIngestContract: IngestContract<typeof recipeExtractSchema, ResolvedInput> = {
  schema: recipeExtractSchema,
  systemPrompt: RECIPE_SYSTEM_PROMPT,
  buildMessages: async (input) => {
    if (input.kind === "text") {
      return {
        prompt: `Extract the recipe from the following text:\n\n${input.content}`,
        warnings: [],
      };
    }

    if (input.kind === "pdf-vision") {
      return {
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "file" as const, data: input.bytes, mediaType: "application/pdf" as const },
              { type: "text" as const, text: "Extract the recipe from this scanned PDF." },
            ],
          },
        ],
        warnings: [],
      };
    }

    const imagePart = toImagePart(input.bytes, input.mimeType);
    return {
      messages: [
        {
          role: "user" as const,
          content: [
            imagePart,
            { type: "text" as const, text: "Extract the recipe from this image." },
          ],
        },
      ],
      warnings: [],
    };
  },
};

async function resolveInput(
  input: RecipeFileInput,
): Promise<{ resolved: ResolvedInput; warnings: string[] }> {
  const warnings: string[] = [];

  if (input.kind === "pdf") {
    const content = await extractPdfContent(input.bytes);
    if (content.kind === "text") {
      if (content.pageCount > 20) {
        warnings.push(`PDF has ${content.pageCount} pages — only first pages were processed`);
      }
      return { resolved: { kind: "text", content: content.text }, warnings };
    }
    warnings.push(
      "PDF appears to be a scanned image. Sending to vision model for OCR — requires a vision-capable model (e.g. gpt-4o).",
    );
    return { resolved: { kind: "pdf-vision", bytes: input.bytes }, warnings };
  }

  return { resolved: input as ResolvedInput, warnings };
}

export async function extractRecipeFromFile(
  input: RecipeFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<RecipeExtractionResult> {
  try {
    const { resolved, warnings: prepWarnings } = await resolveInput(input);

    const result = await runFill({
      contract: recipeIngestContract,
      sourceContext: resolved,
      config,
    });

    const recipe: Record<string, unknown> = {};
    for (const [field, suggestion] of result.suggestions) {
      if (suggestion.kind === "single") recipe[field] = suggestion.value;
    }

    const base: RecipeExtractionResult = {
      recipe: recipe as RecipeExtract,
      warnings: [...prepWarnings, ...result.warnings],
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Recipe extraction failed");
  }
}
