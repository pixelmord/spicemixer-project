import type { AiConfig } from "@pixelmord/content-ai-core";
import { type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { ingestFields, resolvePdf } from "@/lib/ai/ingest.ts";
import { toImagePart } from "@/lib/image.ts";
import {
  ingredientExtractSchema,
  type IngredientExtract,
} from "@/contracts/schemas/ingredient-extract.ts";
import {
  type AiLocale,
  preserveSourceLanguageDirective,
  targetLanguageDirective,
} from "@/lib/ai/language-directive.ts";

export interface ExtractOptions {
  debug?: boolean;
  /** When set, force the output into this language (translate source if needed). */
  targetLocale?: AiLocale;
}

export type IngredientFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

export interface IngredientExtractionResult {
  ingredient: IngredientExtract;
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
- Copy name, description, origin, and flavorNotes VERBATIM where the source provides them. Do not paraphrase or rewrite the author's wording.
- The only field you may freely shorten is "summary" (see rule below). Everything else stays in the source's original phrasing.`;

  return `You are a culinary ingredient data extractor. Given text or an image about a spice, herb, or ingredient, extract structured information.

${languageBlock}

Extraction rules:
- category must be one of: spice, herb, seed, dried-fruit, salt, acid, allium, other (this is a fixed enum, not translated)
- origin should be country or region names
- flavorNotes should be concise flavor descriptors (e.g. "floral", "warm", "citrusy", "earthy")
- summary should be 1-2 sentences; description may be longer
- If a field is not present in the source, omit it`;
}

function buildContract(
  targetLocale?: AiLocale,
): IngestContract<typeof ingredientExtractSchema, ResolvedInput> {
  return {
    schema: ingredientExtractSchema,
    systemPrompt: buildSystemPrompt(targetLocale),
    buildMessages: async (input) => {
      if (input.kind === "text") {
        return {
          prompt: `Extract ingredient information from the following text:\n\n${input.content}`,
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
                {
                  type: "text" as const,
                  text: "Extract ingredient information from this scanned PDF.",
                },
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
              { type: "text" as const, text: "Extract ingredient information from this image." },
            ],
          },
        ],
        warnings: [],
      };
    },
  };
}

async function resolveInput(
  input: IngredientFileInput,
): Promise<{ resolved: ResolvedInput; warnings: string[] }> {
  if (input.kind === "pdf") return resolvePdf(input.bytes);
  return { resolved: input, warnings: [] };
}

export async function extractIngredientFromFile(
  input: IngredientFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<IngredientExtractionResult> {
  try {
    const { resolved, warnings: prepWarnings } = await resolveInput(input);
    const { fields, warnings } = await ingestFields(
      buildContract(options.targetLocale),
      resolved,
      config,
    );

    const base: IngredientExtractionResult = {
      ingredient: fields as IngredientExtract,
      warnings: [...prepWarnings, ...warnings],
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Ingredient extraction failed");
  }
}
