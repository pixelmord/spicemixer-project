import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { toAiError } from "@/lib/ai-debug.ts";
import { toImagePart } from "@/lib/image.ts";
import { extractPdfContent } from "@/lib/pdf.ts";
import {
  ingredientExtractSchema,
  type IngredientExtract,
} from "@/contracts/schemas/ingredient-extract.ts";

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

type ResolvedMergeIngredientSource =
  | { kind: "text"; content: string }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "pdf-vision"; bytes: Uint8Array }
  | { kind: "prompt"; prompt: string };

interface ResolvedMergeIngredientInput {
  existing: IngredientExtract;
  source: ResolvedMergeIngredientSource;
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

const ingredientMergeContract: IngestContract<
  typeof ingredientExtractSchema,
  ResolvedMergeIngredientInput
> = {
  schema: ingredientExtractSchema,
  systemPrompt: MERGE_SYSTEM_PROMPT,
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

async function resolveSource(
  source: MergeIngredientSource,
): Promise<{ resolved: ResolvedMergeIngredientSource; warnings: string[] }> {
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

export async function mergeIngredient(
  input: MergeIngredientInput,
  config: AiConfig,
): Promise<MergeIngredientResult> {
  try {
    const { resolved: resolvedSource, warnings: prepWarnings } = await resolveSource(input.source);
    const resolvedInput: ResolvedMergeIngredientInput = {
      existing: input.existing,
      source: resolvedSource,
    };

    const result = await runFill({
      contract: ingredientMergeContract,
      sourceContext: resolvedInput,
      config,
    });

    const ingredient: Record<string, unknown> = {};
    for (const [field, suggestion] of result.suggestions) {
      if (suggestion.kind === "single") ingredient[field] = suggestion.value;
    }

    return {
      ingredient: ingredient as IngredientExtract,
      warnings: [...prepWarnings, ...result.warnings],
    };
  } catch (e) {
    throw toAiError(e, "Ingredient merge failed");
  }
}
