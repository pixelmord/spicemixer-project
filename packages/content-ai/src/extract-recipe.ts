import { generateText, Output } from "ai";
import { AiError } from "./errors.ts";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { recipeExtractSchema, type RecipeExtract } from "./schemas/recipe-extract.ts";

export type RecipeFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

const RECIPE_SYSTEM_PROMPT = `You are a culinary data extractor. Given text or an image of a recipe, extract it into a structured JSON object.
- List each ingredient as a separate string in recipeIngredient (e.g. "2 cups flour", "1 tsp salt")
- List each instruction step as a separate object in recipeInstructions
- Times should be in ISO 8601 duration format (e.g. "PT30M", "PT1H15M") if parseable, otherwise leave empty
- Extract keywords as individual tags, not comma-separated strings
- If a field is not present in the source, omit it`;

export interface RecipeExtractionResult {
  recipe: RecipeExtract;
  warnings: string[];
}

export async function extractRecipeFromFile(
  input: RecipeFileInput,
  config: AiConfig,
): Promise<RecipeExtractionResult> {
  const model = createProvider(config);
  const warnings: string[] = [];

  try {
    let recipe: RecipeExtract;

    if (input.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: recipeExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: RECIPE_SYSTEM_PROMPT,
        prompt: `Extract the recipe from the following text:\n\n${input.content}`,
      });
      recipe = r.output;
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
    }

    return { recipe, warnings };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("EXTRACTION_FAILED", `Recipe extraction failed: ${String(e)}`);
  }
}
