import { generateText, Output } from "ai";
import { AiError } from "./errors.ts";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { extractPdfContent } from "./pdf.ts";
import { toImagePart } from "./image.ts";
import { pairingExtractSchema, type PairingExtract } from "./schemas/pairing-extract.ts";

export type PairingFileInput =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string }
  | { kind: "text"; content: string };

export interface PairingExtractionResult {
  pairing: PairingExtract;
  warnings: string[];
}

const SYSTEM_PROMPT = `You are extracting culinary ingredient pairing information.
Given text or an image about how two ingredients work together, extract:
- ingredient1: slug/name of the first ingredient (lowercase, hyphen-separated)
- ingredient2: slug/name of the second ingredient (lowercase, hyphen-separated)
- description: 1-2 sentence explanation of why they pair well

If you can't identify two distinct ingredients, do your best with what's available.`;

export async function extractPairingFromFile(
  input: PairingFileInput,
  config: AiConfig,
): Promise<PairingExtractionResult> {
  const model = createProvider(config);
  const warnings: string[] = [];

  try {
    let pairing: PairingExtract;

    if (input.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: pairingExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: SYSTEM_PROMPT,
        prompt: `Extract ingredient pairing from:\n\n${input.content}`,
      });
      pairing = r.output;
    } else if (input.kind === "pdf") {
      const content = await extractPdfContent(input.bytes);
      if (content.kind === "text") {
        const r = await generateText({
          model,
          output: Output.object({ schema: pairingExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: SYSTEM_PROMPT,
          prompt: `Extract ingredient pairing from:\n\n${content.text}`,
        });
        pairing = r.output;
      } else {
        warnings.push("PDF appears to be scanned — using vision model.");
        const r = await generateText({
          model,
          output: Output.object({ schema: pairingExtractSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "file", data: content.bytes, mediaType: "application/pdf" },
                { type: "text", text: "Extract ingredient pairing from this document." },
              ],
            },
          ],
        });
        pairing = r.output;
      }
    } else {
      const imagePart = toImagePart(input.bytes, input.mimeType);
      const r = await generateText({
        model,
        output: Output.object({ schema: pairingExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              imagePart,
              { type: "text", text: "Extract ingredient pairing from this image." },
            ],
          },
        ],
      });
      pairing = r.output;
    }

    return { pairing, warnings };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("EXTRACTION_FAILED", `Pairing extraction failed: ${String(e)}`);
  }
}
