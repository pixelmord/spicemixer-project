import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { toImagePart } from "@/lib/image.ts";
import { extractPdfContent } from "@/lib/pdf.ts";
import {
  ingredientExtractSchema,
  type IngredientExtract,
} from "@/contracts/schemas/ingredient-extract.ts";
import type { ExtractOptions } from "@/lib/ai/extract-recipe.ts";

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

const ingredientIngestContract: IngestContract<typeof ingredientExtractSchema, ResolvedInput> = {
  schema: ingredientExtractSchema,
  systemPrompt: INGREDIENT_SYSTEM_PROMPT,
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

async function resolveInput(
  input: IngredientFileInput,
): Promise<{ resolved: ResolvedInput; warnings: string[] }> {
  const warnings: string[] = [];

  if (input.kind === "pdf") {
    const content = await extractPdfContent(input.bytes);
    if (content.kind === "text") {
      return { resolved: { kind: "text", content: content.text }, warnings };
    }
    warnings.push(
      "PDF appears to be a scanned image. Sending to vision model for OCR — requires a vision-capable model (e.g. gpt-4o).",
    );
    return { resolved: { kind: "pdf-vision", bytes: input.bytes }, warnings };
  }

  return { resolved: input as ResolvedInput, warnings };
}

export async function extractIngredientFromFile(
  input: IngredientFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<IngredientExtractionResult> {
  try {
    const { resolved, warnings: prepWarnings } = await resolveInput(input);

    const result = await runFill({
      contract: ingredientIngestContract,
      sourceContext: resolved,
      config,
    });

    const ingredient: Record<string, unknown> = {};
    for (const [field, suggestion] of result.suggestions) {
      if (suggestion.kind === "single") ingredient[field] = suggestion.value;
    }

    const base: IngredientExtractionResult = {
      ingredient: ingredient as IngredientExtract,
      warnings: [...prepWarnings, ...result.warnings],
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Ingredient extraction failed");
  }
}
