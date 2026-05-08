import { generateText, Output } from "ai";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { debugFromResult, toAiError, type AiDebugInfo } from "./debug.ts";
import type { ExtractOptions } from "./extract-recipe.ts";
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
  debug?: AiDebugInfo;
}

const SYSTEM_PROMPT = `You are extracting culinary ingredient pairing information.

LANGUAGE — non-negotiable:
- Preserve the source language exactly for the description. If the source is in German, write the description in German; if French, French; etc. Never translate.
- Use the source's own wording for the description rather than paraphrasing.

Given text or an image about how two ingredients work together, extract:
- ingredient1: slug/name of the first ingredient (lowercase, hyphen-separated, ASCII — slugs stay in English/ASCII regardless of source language)
- ingredient2: slug/name of the second ingredient (lowercase, hyphen-separated, ASCII)
- description: 1-2 sentence explanation of why they pair well, in the source language

If you can't identify two distinct ingredients, do your best with what's available.`;

export async function extractPairingFromFile(
  input: PairingFileInput,
  config: AiConfig,
  options: ExtractOptions = {},
): Promise<PairingExtractionResult> {
  const model = createProvider(config);
  const warnings: string[] = [];

  try {
    let pairing: PairingExtract;
    let debug: AiDebugInfo | undefined;

    if (input.kind === "text") {
      const r = await generateText({
        model,
        output: Output.object({ schema: pairingExtractSchema }),
        providerOptions: PROVIDER_OPTIONS,
        system: SYSTEM_PROMPT,
        prompt: `Extract ingredient pairing from:\n\n${input.content}`,
      });
      pairing = r.output;
      if (options.debug) debug = debugFromResult(r);
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
        if (options.debug) debug = debugFromResult(r);
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
        if (options.debug) debug = debugFromResult(r);
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
      if (options.debug) debug = debugFromResult(r);
    }

    return debug ? { pairing, warnings, debug } : { pairing, warnings };
  } catch (e) {
    throw toAiError(e, "Pairing extraction failed");
  }
}
