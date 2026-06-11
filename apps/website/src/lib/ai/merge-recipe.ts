import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { toImagePart } from "@/lib/image.ts";
import { extractPdfContent } from "@/lib/pdf.ts";
import { recipeExtractSchema, type RecipeExtract } from "@/contracts/schemas/recipe-extract.ts";
import { type AiLocale, mergeLanguageDirective } from "@/lib/ai/language-directive.ts";

export type MergeRecipeSource =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string }
  | { kind: "prompt"; prompt: string };

export interface MergeRecipeInput {
  existing: RecipeExtract;
  source: MergeRecipeSource;
  /** Locale of the existing recipe — used to lock output language. */
  existingLocale?: AiLocale;
}

export interface MergeRecipeResult {
  recipe: RecipeExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

export interface MergeOptions {
  debug?: boolean;
}

type ResolvedMergeRecipeSource =
  | { kind: "text"; content: string }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "pdf-vision"; bytes: Uint8Array }
  | { kind: "prompt"; prompt: string };

interface ResolvedMergeRecipeInput {
  existing: RecipeExtract;
  source: ResolvedMergeRecipeSource;
}

function buildSystemPrompt(existingLocale?: AiLocale): string {
  return `You are a recipe editor merging new content into an existing recipe.

CRITICAL — field preservation rules:
- You MUST copy every field that exists in the existing recipe into your output, even if the new content does not mention it.
- Fields you must NEVER drop if they are present: prepTime, cookTime, totalTime, recipeYield, recipeCategory, recipeCuisine, keywords.
- Only REPLACE a field if the new content explicitly provides a clearly better value for that specific field.
- Only ADD to ingredients or instructions if the new content provides something genuinely new.
- Combine keywords from both sources; never reduce the keyword list.
- Do NOT invent or hallucinate values — if the new content does not address a field, copy it verbatim from the existing recipe.

${mergeLanguageDirective(existingLocale)}
- Never paraphrase or summarize existing content. Copy strings verbatim except where the user explicitly asks for a change.

The user's prompt describes ONLY what they want changed. Everything else stays exactly as it is.`;
}

function buildContract(
  existingLocale?: AiLocale,
): IngestContract<typeof recipeExtractSchema, ResolvedMergeRecipeInput> {
  return {
    schema: recipeExtractSchema,
    systemPrompt: buildSystemPrompt(existingLocale),
    buildMessages: async (input) => {
      const existingJson = JSON.stringify(input.existing, null, 2);
      const basePrompt = `EXISTING RECIPE — copy every field into your output; only change what the request explicitly asks for:\n${existingJson}`;

      if (input.source.kind === "prompt") {
        return {
          prompt: `${basePrompt}\n\nREQUESTED CHANGE:\n${input.source.prompt}`,
          warnings: [],
        };
      }

      if (input.source.kind === "text") {
        return {
          prompt: `${basePrompt}\n\nNEW CONTENT TO MERGE IN:\n${input.source.content}`,
          warnings: [],
        };
      }

      if (input.source.kind === "pdf-vision") {
        return {
          messages: [
            {
              role: "user" as const,
              content: [
                {
                  type: "file" as const,
                  data: input.source.bytes,
                  mediaType: "application/pdf" as const,
                },
                {
                  type: "text" as const,
                  text: `${basePrompt}\n\nNEW CONTENT TO MERGE IN: (see attached scanned PDF)`,
                },
              ],
            },
          ],
          warnings: [],
        };
      }

      const imagePart = toImagePart(input.source.bytes, input.source.mimeType);
      return {
        messages: [
          {
            role: "user" as const,
            content: [
              imagePart,
              {
                type: "text" as const,
                text: `${basePrompt}\n\nNEW CONTENT TO MERGE IN: (see attached image)`,
              },
            ],
          },
        ],
        warnings: [],
      };
    },
  };
}

async function resolveSource(
  source: MergeRecipeSource,
): Promise<{ resolved: ResolvedMergeRecipeSource; warnings: string[] }> {
  if (source.kind === "pdf") {
    const content = await extractPdfContent(source.bytes);
    if (content.kind === "text") {
      return { resolved: { kind: "text", content: content.text }, warnings: [] };
    }
    return {
      resolved: { kind: "pdf-vision", bytes: source.bytes },
      warnings: ["PDF appears to be scanned — using vision model for OCR."],
    };
  }
  return { resolved: source, warnings: [] };
}

export async function mergeRecipe(
  input: MergeRecipeInput,
  config: AiConfig,
  options: MergeOptions = {},
): Promise<MergeRecipeResult> {
  try {
    const { resolved: resolvedSource, warnings: prepWarnings } = await resolveSource(input.source);
    const resolvedInput: ResolvedMergeRecipeInput = {
      existing: input.existing,
      source: resolvedSource,
    };

    const result = await runFill({
      contract: buildContract(input.existingLocale),
      sourceContext: resolvedInput,
      config,
    });

    const recipe: Record<string, unknown> = {};
    for (const [field, suggestion] of result.suggestions) {
      if (suggestion.kind === "single") recipe[field] = suggestion.value;
    }

    const base: MergeRecipeResult = {
      recipe: recipe as RecipeExtract,
      warnings: [...prepWarnings, ...result.warnings],
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Recipe merge failed");
  }
}
