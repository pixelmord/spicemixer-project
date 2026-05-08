import { generateText, Output } from "ai";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { debugFromResult, toAiError, type AiDebugInfo } from "./debug.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { recipeExtractSchema, type RecipeExtract } from "./schemas/recipe-extract.ts";

export type RecipeFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

export interface ExtractOptions {
  /** When true, the result includes raw model telemetry for debugging. */
  debug?: boolean;
}

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

export interface RecipeExtractionResult {
  recipe: RecipeExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

export async function extractRecipeFromFile(
  input: RecipeFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<RecipeExtractionResult> {
  const model = createProvider(config);
  const warnings: string[] = [];

  try {
    let recipe: RecipeExtract;
    let debug: AiDebugInfo | undefined;

    if (input.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: recipeExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: RECIPE_SYSTEM_PROMPT,
        prompt: `Extract the recipe from the following text:\n\n${input.content}`,
      });
      recipe = r.output;
      if (options.debug) debug = debugFromResult(r);
    } else if (input.kind === "pdf") {
      const content = await extractPdfContent(input.bytes);

      if (content.kind === "text") {
        if (content.pageCount > 20) {
          warnings.push(`PDF has ${content.pageCount} pages — only first pages were processed`);
        }
        const r = await generateText({
          model,
          output: Output.object({ schema: recipeExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: RECIPE_SYSTEM_PROMPT,
          prompt: `Extract the recipe from the following text:\n\n${content.text}`,
        });
        recipe = r.output;
        if (options.debug) debug = debugFromResult(r);
      } else {
        // Scanned PDF — send raw bytes as a file part for vision models
        warnings.push(
          "PDF appears to be a scanned image. Sending to vision model for OCR — requires a vision-capable model (e.g. gpt-4o).",
        );
        const r = await generateText({
          model,
          output: Output.object({ schema: recipeExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: RECIPE_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "file",
                  data: content.bytes,
                  mediaType: "application/pdf",
                },
                { type: "text", text: "Extract the recipe from this scanned PDF." },
              ],
            },
          ],
        });
        recipe = r.output;
        if (options.debug) debug = debugFromResult(r);
      }
    } else {
      const imagePart = toImagePart(input.bytes, input.mimeType);
      const r = await generateText({
        model,
        output: Output.object({ schema: recipeExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: RECIPE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [imagePart, { type: "text", text: "Extract the recipe from this image." }],
          },
        ],
      });
      recipe = r.output;
      if (options.debug) debug = debugFromResult(r);
    }

    return debug ? { recipe, warnings, debug } : { recipe, warnings };
  } catch (e) {
    throw toAiError(e, "Recipe extraction failed");
  }
}
