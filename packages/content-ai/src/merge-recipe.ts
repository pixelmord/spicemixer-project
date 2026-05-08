import { generateText, Output } from "ai";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { debugFromResult, toAiError, type AiDebugInfo } from "./debug.ts";
import type { ExtractOptions } from "./extract-recipe.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { recipeExtractSchema, type RecipeExtract } from "./schemas/recipe-extract.ts";

export type MergeSource =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string }
  | { kind: "prompt"; prompt: string };

export interface MergeRecipeInput {
  existing: RecipeExtract;
  source: MergeSource;
}

export interface MergeRecipeResult {
  recipe: RecipeExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

const MERGE_SYSTEM_PROMPT = `You are a recipe editor merging new content into an existing recipe.

CRITICAL — field preservation rules:
- You MUST copy every field that exists in the existing recipe into your output, even if the new content does not mention it.
- Fields you must NEVER drop if they are present: prepTime, cookTime, totalTime, recipeYield, recipeCategory, recipeCuisine, keywords.
- Only REPLACE a field if the new content explicitly provides a clearly better value for that specific field.
- Only ADD to ingredients or instructions if the new content provides something genuinely new.
- Combine keywords from both sources; never reduce the keyword list.
- Do NOT invent or hallucinate values — if the new content does not address a field, copy it verbatim from the existing recipe.

LANGUAGE — non-negotiable:
- Preserve the language of the existing recipe. If existing fields are in German, keep them in German; never translate them.
- For new content being merged in, keep it in its original language as well, unless that conflicts with the existing recipe's language — in which case match the existing recipe's language by using its existing wording where overlaps occur.
- Never paraphrase or summarize existing content. Copy strings verbatim except where the user explicitly asks for a change.

The user's prompt describes ONLY what they want changed. Everything else stays exactly as it is.`;

export async function mergeRecipe(
  input: MergeRecipeInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<MergeRecipeResult> {
  const model = createProvider(config);
  const warnings: string[] = [];
  const existingJson = JSON.stringify(input.existing, null, 2);
  const basePrompt = `EXISTING RECIPE — copy every field into your output; only change what the request explicitly asks for:\n${existingJson}`;

  try {
    let recipe: RecipeExtract;
    let debug: AiDebugInfo | undefined;

    if (input.source.kind === "prompt") {
      const r = await generateText({
        model,
        output: Output.object({ schema: recipeExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM_PROMPT,
        prompt: `${basePrompt}\n\nREQUESTED CHANGE:\n${input.source.prompt}`,
      });
      recipe = r.output;
      if (options.debug) debug = debugFromResult(r);
    } else if (input.source.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: recipeExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM_PROMPT,
        prompt: `${basePrompt}\n\nNEW CONTENT TO MERGE IN:\n${input.source.content}`,
      });
      recipe = r.output;
      if (options.debug) debug = debugFromResult(r);
    } else if (input.source.kind === "pdf") {
      const content = await extractPdfContent(input.source.bytes);

      if (content.kind === "text") {
        const r = await generateText({
          model,
          output: Output.object({ schema: recipeExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: MERGE_SYSTEM_PROMPT,
          prompt: `${basePrompt}\n\nNEW CONTENT TO MERGE IN:\n${content.text}`,
        });
        recipe = r.output;
        if (options.debug) debug = debugFromResult(r);
      } else {
        warnings.push("PDF appears to be scanned — using vision model for OCR.");
        const r = await generateText({
          model,
          output: Output.object({ schema: recipeExtractSchema }),
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
        recipe = r.output;
        if (options.debug) debug = debugFromResult(r);
      }
    } else {
      const imagePart = toImagePart(input.source.bytes, input.source.mimeType);
      const r = await generateText({
        model,
        output: Output.object({ schema: recipeExtractSchema }),
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
      recipe = r.output;
      if (options.debug) debug = debugFromResult(r);
    }

    return debug ? { recipe, warnings, debug } : { recipe, warnings };
  } catch (e) {
    throw toAiError(e, "Recipe merge failed");
  }
}
