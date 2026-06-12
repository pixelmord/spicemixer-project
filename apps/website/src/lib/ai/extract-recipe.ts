import type { AiConfig } from "@pixelmord/content-ai-core";
import { type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { ingestFields, resolvePdf } from "@/lib/ai/ingest.ts";
import { toImagePart } from "@/lib/image.ts";
import { recipeExtractSchema, type RecipeExtract } from "@/contracts/schemas/recipe-extract.ts";
import {
  type AiLocale,
  preserveSourceLanguageDirective,
  targetLanguageDirective,
} from "@/lib/ai/language-directive.ts";

export type RecipeFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

export interface ExtractOptions {
  debug?: boolean;
  /** When set, force the output into this language (translate source if needed). */
  targetLocale?: AiLocale;
}

export interface RecipeExtractionResult {
  recipe: RecipeExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

type ResolvedInput =
  | { kind: "text"; content: string }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "pdf-vision"; bytes: Uint8Array };

function buildSystemPrompt(targetLocale?: AiLocale): string {
  const languageBlock = targetLocale
    ? targetLanguageDirective(targetLocale)
    : `${preserveSourceLanguageDirective}
- Copy ingredient strings, instruction steps, name, description, and keywords VERBATIM from the source. Do not paraphrase, summarize, shorten, or rewrite. Keep the author's exact wording, including units, brand names, and idiomatic phrasing.
- The only fields you may normalize are times (to ISO 8601) and structural splitting (one ingredient per array entry, one step per array entry).`;

  return `You are a culinary data extractor. Given text or an image of a recipe, extract it into a structured JSON object.

${languageBlock}

Extraction rules:
- List each ingredient as a separate string in recipeIngredient (e.g. "2 cups flour", "1 tsp salt")
- List each instruction step as a separate object in recipeInstructions
- Times should be in ISO 8601 duration format (e.g. "PT30M", "PT1H15M") if parseable, otherwise leave empty
- Extract keywords as individual tags, not comma-separated strings
- If a field is not present in the source, omit it`;
}

function buildContract(
  targetLocale?: AiLocale,
): IngestContract<typeof recipeExtractSchema, ResolvedInput> {
  return {
    schema: recipeExtractSchema,
    systemPrompt: buildSystemPrompt(targetLocale),
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
}

async function resolveInput(
  input: RecipeFileInput,
): Promise<{ resolved: ResolvedInput; warnings: string[] }> {
  if (input.kind === "pdf") return resolvePdf(input.bytes, { warnLargePdf: true });
  return { resolved: input, warnings: [] };
}

export async function extractRecipeFromFile(
  input: RecipeFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<RecipeExtractionResult> {
  try {
    const { resolved, warnings: prepWarnings } = await resolveInput(input);
    const { fields, warnings } = await ingestFields(
      buildContract(options.targetLocale),
      resolved,
      config,
    );

    const base: RecipeExtractionResult = {
      recipe: fields as RecipeExtract,
      warnings: [...prepWarnings, ...warnings],
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Recipe extraction failed");
  }
}
