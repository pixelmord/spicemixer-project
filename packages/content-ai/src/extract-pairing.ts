import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "./debug.ts";
import { toImagePart } from "./image.ts";
import { extractPdfContent } from "./pdf.ts";
import { pairingExtractSchema, type PairingExtract } from "./schemas/pairing-extract.ts";
import type { ExtractOptions } from "./extract-recipe.ts";

export type PairingFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

export interface PairingExtractionResult {
  pairing: PairingExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

const PAIRING_SYSTEM_PROMPT = `You are extracting culinary ingredient pairing information.

LANGUAGE — non-negotiable:
- Preserve the source language exactly for the description. If the source is in German, write the description in German; if French, French; etc. Never translate.
- Use the source's own wording for the description rather than paraphrasing.

Given text or an image about how two ingredients work together, extract:
- ingredient1: slug/name of the first ingredient (lowercase, hyphen-separated, ASCII — slugs stay in English/ASCII regardless of source language)
- ingredient2: slug/name of the second ingredient (lowercase, hyphen-separated, ASCII)
- description: 1-2 sentence explanation of why they pair well, in the source language

If you can't identify two distinct ingredients, do your best with what's available.`;

const pairingIngestContract: IngestContract<typeof pairingExtractSchema, PairingFileInput> = {
  schema: pairingExtractSchema,
  systemPrompt: PAIRING_SYSTEM_PROMPT,
  buildMessages: async (input) => {
    const warnings: string[] = [];

    if (input.kind === "text") {
      return { prompt: `Extract ingredient pairing from:\n\n${input.content}`, warnings };
    }

    if (input.kind === "pdf") {
      const content = await extractPdfContent(input.bytes);
      if (content.kind === "text") {
        return { prompt: `Extract ingredient pairing from:\n\n${content.text}`, warnings };
      }
      warnings.push("PDF appears to be scanned — using vision model.");
      return {
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "file" as const, data: content.bytes, mediaType: "application/pdf" as const },
              { type: "text" as const, text: "Extract ingredient pairing from this document." },
            ],
          },
        ],
        warnings,
      };
    }

    const imagePart = toImagePart(input.bytes, input.mimeType);
    return {
      messages: [
        {
          role: "user" as const,
          content: [
            imagePart,
            { type: "text" as const, text: "Extract ingredient pairing from this image." },
          ],
        },
      ],
      warnings,
    };
  },
};

export async function extractPairingFromFile(
  input: PairingFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<PairingExtractionResult> {
  try {
    const result = await runFill({
      contract: pairingIngestContract,
      sourceContext: input,
      config,
    });

    const pairing: Record<string, unknown> = {};
    for (const [field, suggestion] of result.suggestions) {
      if (suggestion.kind === "single") pairing[field] = suggestion.value;
    }

    const base: PairingExtractionResult = {
      pairing: pairing as PairingExtract,
      warnings: result.warnings,
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Pairing extraction failed");
  }
}
