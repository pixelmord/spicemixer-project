import { generateText, Output } from "ai";
import { z } from "zod";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { AiError } from "./errors.ts";
import type { ImprovementProposal, TranslationDraft } from "./curate-recipe.ts";

export type { ImprovementProposal, TranslationDraft };

export interface PairingSnapshot {
  ingredient1: string;
  ingredient2: string;
  description?: string;
}

export async function proposePairingImprovements(
  pairing: PairingSnapshot,
  locale: string,
  config: AiConfig,
  rejectedContext?: string,
): Promise<ImprovementProposal> {
  if (!pairing.ingredient1 || !pairing.ingredient2) return { fields: [] };

  const model = createProvider(config);
  const schema = z.object({
    fields: z.array(z.object({ field: z.string(), suggestion: z.string(), rationale: z.string() })),
  });

  const context = [
    `Ingredient pair: ${pairing.ingredient1} ↔ ${pairing.ingredient2}`,
    pairing.description ? `Current description: ${pairing.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const rejectedSection = rejectedContext ? `\n\n${rejectedContext}` : "";

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Improve the description for this culinary ingredient pairing.

${context}

Locale: ${locale}

Rules:
- Write in ${locale} if locale is not "en"
- Focus on WHY these ingredients pair well — flavor harmony, culinary tradition, texture contrast
- Keep it to 1-2 sentences, vivid and informative
- Do not suggest image URLs
- Always return field: "description"${rejectedSection}`,
    });
    // Ensure field is always "description" regardless of model output
    return {
      fields: output.fields.map((f) => ({ ...f, field: "description" })),
    };
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Pairing improvement failed: ${String(e)}`);
  }
}

export async function proposePairingTranslation(
  pairing: PairingSnapshot,
  sourceLocale: string,
  targetLocale: string,
  config: AiConfig,
): Promise<TranslationDraft> {
  if (!pairing.description) return { targetLocale, fields: {} };

  const model = createProvider(config);
  const schema = z.object({ fields: z.record(z.string(), z.string()) });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Translate the following ingredient pairing description from ${sourceLocale} to ${targetLocale}.

Description: "${pairing.description}"

Return { fields: { description: "<translated>" } }`,
    });
    return { targetLocale, fields: output.fields };
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Pairing translation failed: ${String(e)}`);
  }
}
