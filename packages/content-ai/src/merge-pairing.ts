import { generateText, Output } from "ai";
import { AiError } from "./errors.ts";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { pairingExtractSchema, type PairingExtract } from "./schemas/pairing-extract.ts";

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

const MERGE_SYSTEM = `You are editing a culinary ingredient pairing description.
RULES:
- Keep ingredient1 and ingredient2 the same unless the new content explicitly corrects them
- Only update the description if the new content provides a clearly better one
- Do NOT invent values — copy existing fields if unchanged
- Description should be 1-2 sentences, vivid, culinary-focused`;

export async function mergePairing(
  input: MergePairingInput,
  config: AiConfig,
): Promise<MergePairingResult> {
  const model = createProvider(config);
  const warnings: string[] = [];
  const existingJson = JSON.stringify(input.existing, null, 2);
  const base = `EXISTING PAIRING (copy fields unless new content explicitly changes them):\n${existingJson}`;

  try {
    let pairing: PairingExtract;

    if (input.source.kind === "prompt") {
      const r = await generateText({
        model,
        output: Output.object({ schema: pairingExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM,
        prompt: `${base}\n\nREQUESTED CHANGE:\n${input.source.prompt}`,
      });
      pairing = r.output;
    } else if (input.source.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: pairingExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM,
        prompt: `${base}\n\nNEW CONTENT TO MERGE:\n${input.source.content}`,
      });
      pairing = r.output;
    } else if (input.source.kind === "pdf") {
      const content = await extractPdfContent(input.source.bytes);
      if (content.kind === "text") {
        const r = await generateText({
          model,
          output: Output.object({ schema: pairingExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: MERGE_SYSTEM,
          prompt: `${base}\n\nNEW CONTENT TO MERGE:\n${content.text}`,
        });
        pairing = r.output;
      } else {
        warnings.push("PDF appears scanned — using vision model.");
        const r = await generateText({
          model,
          output: Output.object({ schema: pairingExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: MERGE_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                { type: "file", data: content.bytes, mediaType: "application/pdf" },
                { type: "text", text: `${base}\n\nNEW CONTENT TO MERGE: (see PDF)` },
              ],
            },
          ],
        });
        pairing = r.output;
      }
    } else {
      const imagePart = toImagePart(input.source.bytes, input.source.mimeType);
      const r = await generateText({
        model,
        output: Output.object({ schema: pairingExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: MERGE_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              imagePart,
              { type: "text", text: `${base}\n\nNEW CONTENT TO MERGE: (see image)` },
            ],
          },
        ],
      });
      pairing = r.output;
    }

    return { pairing, warnings };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("EXTRACTION_FAILED", `Pairing merge failed: ${String(e)}`);
  }
}
