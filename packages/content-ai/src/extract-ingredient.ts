import { generateText, Output } from "ai";
import { AiError } from "./errors.ts";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { ingredientExtractSchema, type IngredientExtract } from "./schemas/ingredient-extract.ts";

export type IngredientFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

const INGREDIENT_SYSTEM_PROMPT = `You are a culinary ingredient data extractor. Given text or an image about a spice, herb, or ingredient, extract structured information.
- category must be one of: spice, herb, seed, dried-fruit, salt, acid, allium, other
- origin should be country or region names
- flavorNotes should be concise flavor descriptors (e.g. "floral", "warm", "citrusy", "earthy")
- summary should be 1-2 sentences; description can be longer
- If a field is not present in the source, omit it`;

export interface IngredientExtractionResult {
  ingredient: IngredientExtract;
  warnings: string[];
}

export async function extractIngredientFromFile(
  input: IngredientFileInput,
  config: AiConfig,
): Promise<IngredientExtractionResult> {
  const model = createProvider(config);
  const warnings: string[] = [];

  try {
    let ingredient: IngredientExtract;

    if (input.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: ingredientExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: INGREDIENT_SYSTEM_PROMPT,
        prompt: `Extract ingredient information from the following text:\n\n${input.content}`,
      });
      ingredient = r.output;
    } else if (input.kind === "pdf") {
      const content = await extractPdfContent(input.bytes);

      if (content.kind === "text") {
        const r = await generateText({
          model,
          output: Output.object({ schema: ingredientExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: INGREDIENT_SYSTEM_PROMPT,
          prompt: `Extract ingredient information from the following text:\n\n${content.text}`,
        });
        ingredient = r.output;
      } else {
        warnings.push(
          "PDF appears to be a scanned image. Sending to vision model for OCR — requires a vision-capable model (e.g. gpt-4o).",
        );
        const r = await generateText({
          model,
          output: Output.object({ schema: ingredientExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: INGREDIENT_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "file", data: content.bytes, mediaType: "application/pdf" },
                {
                  type: "text",
                  text: "Extract ingredient information from this scanned PDF.",
                },
              ],
            },
          ],
        });
        ingredient = r.output;
      }
    } else {
      const imagePart = toImagePart(input.bytes, input.mimeType);
      const r = await generateText({
        model,
        output: Output.object({ schema: ingredientExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: INGREDIENT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              imagePart,
              { type: "text", text: "Extract ingredient information from this image." },
            ],
          },
        ],
      });
      ingredient = r.output;
    }

    return { ingredient, warnings };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("EXTRACTION_FAILED", `Ingredient extraction failed: ${String(e)}`);
  }
}
