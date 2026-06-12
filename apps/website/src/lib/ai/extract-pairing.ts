import type { AiConfig } from "@pixelmord/content-ai-core";
import { type IngestContract } from "@pixelmord/content-ai-ingest";
import { debugFromResult, toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { ingestFields, resolvePdf } from "@/lib/ai/ingest.ts";
import { toImagePart } from "@/lib/image.ts";
import { pairingExtractSchema, type PairingExtract } from "@/contracts/schemas/pairing-extract.ts";
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

function buildSystemPrompt(targetLocale?: AiLocale): string {
  const languageBlock = targetLocale
    ? targetLanguageDirective(targetLocale)
    : `${preserveSourceLanguageDirective}
- Use the source's own wording for the description rather than paraphrasing.`;

  return `You are extracting culinary ingredient pairing information.

${languageBlock}

Given text or an image about how two ingredients work together, extract:
- ingredient1: slug/name of the first ingredient (lowercase, hyphen-separated, ASCII — slugs stay in English/ASCII regardless of language)
- ingredient2: slug/name of the second ingredient (lowercase, hyphen-separated, ASCII)
- description: 1-2 sentence explanation of why they pair well

If you can't identify two distinct ingredients, do your best with what's available.`;
}

function buildContract(
  targetLocale?: AiLocale,
): IngestContract<typeof pairingExtractSchema, ResolvedInput> {
  return {
    schema: pairingExtractSchema,
    systemPrompt: buildSystemPrompt(targetLocale),
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
}

async function resolveInput(
  input: PairingFileInput,
): Promise<{ resolved: ResolvedInput; warnings: string[] }> {
  if (input.kind === "pdf") return resolvePdf(input.bytes);
  return { resolved: input, warnings: [] };
}

export async function extractPairingFromFile(
  input: PairingFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<PairingExtractionResult> {
  try {
    const { resolved, warnings: prepWarnings } = await resolveInput(input);
    const { fields, warnings } = await ingestFields(
      buildContract(options.targetLocale),
      resolved,
      config,
    );

    const base: PairingExtractionResult = {
      pairing: fields as PairingExtract,
      warnings: [...prepWarnings, ...warnings],
    };

    if (options.debug) {
      base.debug = debugFromResult({ response: { modelId: config.model } });
    }

    return base;
  } catch (e) {
    throw toAiError(e, "Pairing extraction failed");
  }
}
