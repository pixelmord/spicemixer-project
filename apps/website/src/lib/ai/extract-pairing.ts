import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { toImagePart } from "@/lib/image.ts";
import { extractPdfContent } from "@/lib/pdf.ts";
import { pairingExtractSchema, type PairingExtract } from "@/contracts/schemas/pairing-extract.ts";
import type { ExtractOptions } from "@/lib/ai/extract-recipe.ts";

export type PairingFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

export interface PairingExtractionResult {
  pairing: PairingExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

type ResolvedInput =
  | { kind: "text"; content: string }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "pdf-vision"; bytes: Uint8Array };

const PAIRING_SYSTEM_PROMPT = `You are extracting culinary ingredient pairing information.

LANGUAGE — non-negotiable:
- Preserve the source language exactly for the description. If the source is in German, write the description in German; if French, French; etc. Never translate.
- Use the source's own wording for the description rather than paraphrasing.

Given text or an image about how two ingredients work together, extract:
- ingredient1: slug/name of the first ingredient (lowercase, hyphen-separated, ASCII — slugs stay in English/ASCII regardless of source language)
- ingredient2: slug/name of the second ingredient (lowercase, hyphen-separated, ASCII)
- description: 1-2 sentence explanation of why they pair well, in the source language

If you can't identify two distinct ingredients, do your best with what's available.`;

const pairingIngestContract: IngestContract<typeof pairingExtractSchema, ResolvedInput> = {
  schema: pairingExtractSchema,
  systemPrompt: PAIRING_SYSTEM_PROMPT,
  buildMessages: async (input) => {
    if (input.kind === "text") {
      return { prompt: `Extract ingredient pairing from:\n\n${input.content}`, warnings: [] };
    }

    if (input.kind === "pdf-vision") {
      return {
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "file" as const, data: input.bytes, mediaType: "application/pdf" as const },
              { type: "text" as const, text: "Extract ingredient pairing from this document." },
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
            { type: "text" as const, text: "Extract ingredient pairing from this image." },
          ],
        },
      ],
      warnings: [],
    };
  },
};

async function resolveInput(
  input: PairingFileInput,
): Promise<{ resolved: ResolvedInput; warnings: string[] }> {
  const warnings: string[] = [];

  if (input.kind === "pdf") {
    const content = await extractPdfContent(input.bytes);
    if (content.kind === "text") {
      return { resolved: { kind: "text", content: content.text }, warnings };
    }
    warnings.push("PDF appears to be scanned — using vision model.");
    return { resolved: { kind: "pdf-vision", bytes: input.bytes }, warnings };
  }

  return { resolved: input as ResolvedInput, warnings };
}

export async function extractPairingFromFile(
  input: PairingFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<PairingExtractionResult> {
  try {
    const { resolved, warnings: prepWarnings } = await resolveInput(input);

    const result = await runFill({
      contract: pairingIngestContract,
      sourceContext: resolved,
      config,
    });

    const pairing: Record<string, unknown> = {};
    for (const [field, suggestion] of result.suggestions) {
      if (suggestion.kind === "single") pairing[field] = suggestion.value;
    }

    const base: PairingExtractionResult = {
      pairing: pairing as PairingExtract,
      warnings: [...prepWarnings, ...result.warnings],
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Pairing extraction failed");
  }
}
