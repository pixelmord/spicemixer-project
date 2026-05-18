import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import { toAiError } from "@/lib/ai-debug.ts";
import { toImagePart } from "@/lib/image.ts";
import { extractPdfContent } from "@/lib/pdf.ts";
import { pairingExtractSchema, type PairingExtract } from "@/contracts/schemas/pairing-extract.ts";

export type MergePairingSource =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string }
  | { kind: "prompt"; prompt: string };

export interface MergePairingInput {
  existing: PairingExtract & { locale: string };
  source: MergePairingSource;
}

export interface MergePairingResult {
  pairing: PairingExtract;
  warnings: string[];
}

type ResolvedMergePairingSource =
  | { kind: "text"; content: string }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "pdf-vision"; bytes: Uint8Array }
  | { kind: "prompt"; prompt: string };

interface ResolvedMergePairingInput {
  existing: PairingExtract & { locale: string };
  source: ResolvedMergePairingSource;
}

const MERGE_SYSTEM_PROMPT = `You are editing a culinary ingredient pairing description.
RULES:
- Keep ingredient1 and ingredient2 the same unless the new content explicitly corrects them
- Only update the description if the new content provides a clearly better one
- Do NOT invent values — copy existing fields if unchanged
- Description should be 1-2 sentences, vivid, culinary-focused`;

const pairingMergeContract: IngestContract<typeof pairingExtractSchema, ResolvedMergePairingInput> =
  {
    schema: pairingExtractSchema,
    systemPrompt: MERGE_SYSTEM_PROMPT,
    buildMessages: async (input) => {
      const existingJson = JSON.stringify(input.existing, null, 2);
      const base = `EXISTING PAIRING (copy fields unless new content explicitly changes them):\n${existingJson}`;

      if (input.source.kind === "prompt") {
        return {
          prompt: `${base}\n\nREQUESTED CHANGE:\n${input.source.prompt}`,
          warnings: [],
        };
      }

      if (input.source.kind === "text") {
        return {
          prompt: `${base}\n\nNEW CONTENT TO MERGE:\n${input.source.content}`,
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
                { type: "text" as const, text: `${base}\n\nNEW CONTENT TO MERGE: (see PDF)` },
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
              { type: "text" as const, text: `${base}\n\nNEW CONTENT TO MERGE: (see image)` },
            ],
          },
        ],
        warnings: [],
      };
    },
  };

async function resolveSource(
  source: MergePairingSource,
): Promise<{ resolved: ResolvedMergePairingSource; warnings: string[] }> {
  if (source.kind === "pdf") {
    const content = await extractPdfContent(source.bytes);
    if (content.kind === "text") {
      return { resolved: { kind: "text", content: content.text }, warnings: [] };
    }
    return {
      resolved: { kind: "pdf-vision", bytes: source.bytes },
      warnings: ["PDF appears scanned — using vision model."],
    };
  }
  return { resolved: source, warnings: [] };
}

export async function mergePairing(
  input: MergePairingInput,
  config: AiConfig,
): Promise<MergePairingResult> {
  try {
    const { resolved: resolvedSource, warnings: prepWarnings } = await resolveSource(input.source);
    const resolvedInput: ResolvedMergePairingInput = {
      existing: input.existing,
      source: resolvedSource,
    };

    const result = await runFill({
      contract: pairingMergeContract,
      sourceContext: resolvedInput,
      config,
    });

    const pairing: Record<string, unknown> = {};
    for (const [field, suggestion] of result.suggestions) {
      if (suggestion.kind === "single") pairing[field] = suggestion.value;
    }

    return {
      pairing: pairing as PairingExtract,
      warnings: [...prepWarnings, ...result.warnings],
    };
  } catch (e) {
    throw toAiError(e, "Pairing merge failed");
  }
}
