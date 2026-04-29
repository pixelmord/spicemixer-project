import { generateText, Output } from "ai";
import { AiError } from "./errors.ts";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { ingredientExtractSchema, type IngredientExtract } from "./schemas/ingredient-extract.ts";

export type MergeIngredientSource =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string }
  | { kind: "prompt"; prompt: string };

export interface MergeIngredientInput {
  existing: IngredientExtract;
  source: MergeIngredientSource;
}

export interface MergeIngredientResult {
  ingredient: IngredientExtract;
  warnings: string[];
}

const MERGE_SYSTEM_PROMPT = `You are a culinary ingredient data editor merging new content into an existing ingredient record.

CRITICAL — field preservation rules:
- Copy every field that exists in the existing ingredient into your output, even if the new content does not mention it.
- Only REPLACE a field if the new content explicitly provides a clearly better value.
- Only ADD to arrays (origin, flavorNotes) if the new content provides something genuinely new.
- Do NOT invent or hallucinate values — if the new content does not address a field, copy it verbatim.
- Do NOT include image URLs unless they are real, publicly accessible images.
- category must be one of: spice, herb, seed, dried-fruit, salt, acid, allium, other

The user's prompt describes ONLY what they want changed. Everything else stays exactly as it is.`;

export async function mergeIngredient(
  input: MergeIngredientInput,
  config: AiConfig,
): Promise<MergeIngredientResult> {
  const model = createProvider(config);
  const warnings: string[] = [];
  const existingJson = JSON.stringify(input.existing, null, 2);
  const basePrompt = `EXISTING INGREDIENT — copy every field into your output; only change what the request explicitly asks for:\n${existingJson}`;

  try {
    let ingredient: IngredientExtract;

    if (input.source.kind === "prompt") {
      const r = await generateText({
        model,
        output: Output.object({ schema: ingredientExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM_PROMPT,
        prompt: `${basePrompt}\n\nREQUESTED CHANGE:\n${input.source.prompt}`,
      });
      ingredient = r.output;
    } else if (input.source.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: ingredientExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM_PROMPT,
        prompt: `${basePrompt}\n\nNEW CONTENT TO MERGE IN:\n${input.source.content}`,
      });
      ingredient = r.output;
    } else if (input.source.kind === "pdf") {
      const content = await extractPdfContent(input.source.bytes);
      if (content.kind === "text") {
        const r = await generateText({
          model,
          output: Output.object({ schema: ingredientExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: MERGE_SYSTEM_PROMPT,
          prompt: `${basePrompt}\n\nNEW CONTENT TO MERGE IN:\n${content.text}`,
        });
        ingredient = r.output;
      } else {
        warnings.push("PDF appears to be scanned — using vision model for OCR.");
        const r = await generateText({
          model,
          output: Output.object({ schema: ingredientExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: MERGE_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "file", data: content.bytes, mediaType: "application/pdf" },
                {
                  type: "text",
                  text: `${basePrompt}\n\nNEW CONTENT TO MERGE IN: (see attached scanned PDF)`,
                },
              ],
            },
          ],
        });
        ingredient = r.output;
      }
    } else {
      const imagePart = toImagePart(input.source.bytes, input.source.mimeType);
      const r = await generateText({
        model,
        output: Output.object({ schema: ingredientExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              imagePart,
              {
                type: "text",
                text: `${basePrompt}\n\nNEW CONTENT TO MERGE IN: (see attached image)`,
              },
            ],
          },
        ],
      });
      ingredient = r.output;
    }

    return { ingredient, warnings };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("EXTRACTION_FAILED", `Ingredient merge failed: ${String(e)}`);
  }
}
