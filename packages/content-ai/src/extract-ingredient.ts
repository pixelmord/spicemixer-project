import { generateText, Output } from "ai";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { debugFromResult, toAiError, type AiDebugInfo } from "./debug.ts";
import type { ExtractOptions } from "./extract-recipe.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { ingredientExtractSchema, type IngredientExtract } from "./schemas/ingredient-extract.ts";

export type IngredientFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

const INGREDIENT_SYSTEM_PROMPT = `You are a culinary ingredient data extractor. Given text or an image about a spice, herb, or ingredient, extract structured information.

LANGUAGE — non-negotiable:
- Preserve the source language exactly. If the source is in German, output German; if French, output French; etc. Never translate.
- Copy name, description, origin, and flavorNotes VERBATIM where the source provides them. Do not paraphrase or rewrite the author's wording.
- The only field you may freely shorten is "summary" (see rule below). Everything else stays in the source's original phrasing.

Extraction rules:
- category must be one of: spice, herb, seed, dried-fruit, salt, acid, allium, other (this is a fixed enum, not translated)
- origin should be country or region names — keep them in the source language
- flavorNotes should be concise flavor descriptors (e.g. "floral", "warm", "citrusy", "earthy") — in the source language
- summary should be 1-2 sentences in the source language; description should preserve the source verbatim and may be longer
- If a field is not present in the source, omit it`;

export interface IngredientExtractionResult {
  ingredient: IngredientExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

export async function extractIngredientFromFile(
  input: IngredientFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<IngredientExtractionResult> {
  const model = createProvider(config);
  const warnings: string[] = [];

  try {
    let ingredient: IngredientExtract;
    let debug: AiDebugInfo | undefined;

    if (input.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: ingredientExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: INGREDIENT_SYSTEM_PROMPT,
        prompt: `Extract ingredient information from the following text:\n\n${input.content}`,
      });
      ingredient = r.output;
      if (options.debug) debug = debugFromResult(r);
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
        if (options.debug) debug = debugFromResult(r);
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
        if (options.debug) debug = debugFromResult(r);
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
      if (options.debug) debug = debugFromResult(r);
    }

    return debug ? { ingredient, warnings, debug } : { ingredient, warnings };
  } catch (e) {
    throw toAiError(e, "Ingredient extraction failed");
  }
}
