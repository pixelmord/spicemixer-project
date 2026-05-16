import { pairingSchema } from "entity-kind";
import type { AiContract } from "@pixelmord/content-ai-refine";

type PairingSchema = typeof pairingSchema;

// Context for pairing refine operations
export interface PairingRefineContext {
  locale?: string;
}

const presets = [
  {
    id: "expand",
    label: "Expand",
    description: "Expand the description with more detail.",
    instruction: "Write in more detail, adding depth and nuance.",
    appliesTo: "text" as const,
    autoApplyOverride: { policy: "never" as const },
  },
];

export const pairingContract: AiContract<PairingSchema, PairingRefineContext> = {
  schema: pairingSchema,
  presets,
  fields: {
    // Description improvement (replaces proposePairingImprovements)
    description: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const locale = sourceContext?.locale ?? "en";
        const ings = Array.isArray(currentData?.ingredients) ? currentData.ingredients : [];
        const ing1 = ings[0] ?? "";
        const ing2 = ings[1] ?? "";
        const currentDesc =
          typeof currentData?.description === "string" ? currentData.description : "";

        return `Improve the description for this culinary ingredient pairing.

Ingredient pair: ${ing1} ↔ ${ing2}
${currentDesc ? `Current description: ${currentDesc}` : ""}

Locale: ${locale}

Rules:
- Write in ${locale} if locale is not "en"
- Focus on WHY these ingredients pair well — flavor harmony, culinary tradition, texture contrast
- Keep it to 1-2 sentences, vivid and informative
- Do not suggest image URLs`;
      },
      autoApply: { policy: "never" },
      presetIds: ["expand"],
      translation: { mode: "translate" },
      writePolicy: "replace",
    },
  },
};
