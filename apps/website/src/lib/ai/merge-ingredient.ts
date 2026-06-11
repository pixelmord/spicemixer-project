import { type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { toAiError } from "@/lib/ai-debug.ts";
import { ingestFields, resolvePdf } from "@/lib/ai/ingest.ts";
import { toImagePart } from "@/lib/image.ts";
import {
  ingredientExtractSchema,
  type IngredientExtract,
} from "@/contracts/schemas/ingredient-extract.ts";
import { type AiLocale, mergeLanguageDirective } from "@/lib/ai/language-directive.ts";

export type MergeIngredientSource =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string }
  | { kind: "prompt"; prompt: string };

export interface MergeIngredientInput {
  existing: IngredientExtract;
  source: MergeIngredientSource;
  /** Locale of the existing record — used to lock output language. */
  existingLocale?: AiLocale;
}

export interface MergeIngredientResult {
  ingredient: IngredientExtract;
  warnings: string[];
}

type ResolvedMergeIngredientSource =
  | { kind: "text"; content: string }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "pdf-vision"; bytes: Uint8Array }
  | { kind: "prompt"; prompt: string };

interface ResolvedMergeIngredientInput {
  existing: IngredientExtract;
  source: ResolvedMergeIngredientSource;
}

function buildSystemPrompt(existingLocale?: AiLocale): string {
  return `You are a culinary ingredient data editor merging new content into an existing ingredient record.

CRITICAL — field preservation rules:
- Copy every field that exists in the existing ingredient into your output, even if the new content does not mention it.
- Only REPLACE a field if the new content explicitly provides a clearly better value.
- Only ADD to arrays (origin, flavorNotes) if the new content provides something genuinely new.
- Do NOT invent or hallucinate values — if the new content does not address a field, copy it verbatim.
- Do NOT include image URLs unless they are real, publicly accessible images.
- category must be one of: spice, herb, seed, dried-fruit, salt, acid, allium, other

${mergeLanguageDirective(existingLocale)}

The user's prompt describes ONLY what they want changed. Everything else stays exactly as it is.`;
}

function buildContract(
  existingLocale?: AiLocale,
): IngestContract<typeof ingredientExtractSchema, ResolvedMergeIngredientInput> {
  return {
    schema: ingredientExtractSchema,
    systemPrompt: buildSystemPrompt(existingLocale),
    buildMessages: async (input) => {
      const existingJson = JSON.stringify(input.existing, null, 2);
      const basePrompt = `EXISTING INGREDIENT — copy every field into your output; only change what the request explicitly asks for:\n${existingJson}`;

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
  source: MergeIngredientSource,
): Promise<{ resolved: ResolvedMergeIngredientSource; warnings: string[] }> {
  if (source.kind === "pdf") return resolvePdf(source.bytes);
  return { resolved: source, warnings: [] };
}

export async function mergeIngredient(
  input: MergeIngredientInput,
  config: AiConfig,
): Promise<MergeIngredientResult> {
  try {
    const { resolved: resolvedSource, warnings: prepWarnings } = await resolveSource(input.source);
    const { fields, warnings } = await ingestFields(
      buildContract(input.existingLocale),
      { existing: input.existing, source: resolvedSource } satisfies ResolvedMergeIngredientInput,
      config,
    );

    return {
      ingredient: fields as IngredientExtract,
      warnings: [...prepWarnings, ...warnings],
    };
  } catch (e) {
    throw toAiError(e, "Ingredient merge failed");
  }
}
