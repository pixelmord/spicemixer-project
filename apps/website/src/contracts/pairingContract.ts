import { pairingSchema } from "entity-kind";
import type { AiContract, FieldConfig } from "@pixelmord/content-ai-refine";
import { localeToLanguageName } from "./locale-language.ts";

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
  {
    id: "tone",
    label: "Adjust Tone",
    description: "Rewrite in a more vivid culinary voice.",
    instruction: "Rewrite in a vivid, editorial culinary voice with sensory language.",
    appliesTo: "text" as const,
    autoApplyOverride: { policy: "never" as const },
  },
  {
    id: "research",
    label: "Research",
    description: "Add culinary context and historical depth.",
    instruction: "Add specific culinary context, flavor chemistry, or historical detail.",
    appliesTo: "text" as const,
    autoApplyOverride: { policy: "never" as const },
  },
];

// Fields that are just structural refs — copied verbatim during translation.
const copyField: FieldConfig<PairingSchema, PairingRefineContext> = {
  translation: { mode: "copy" },
};

export const pairingContract: AiContract<PairingSchema, PairingRefineContext> = {
  schema: pairingSchema,
  presets,
  fields: {
    description: {
      systemPrompt: ({ currentData, sourceContext }) => {
        const locale = sourceContext?.locale ?? "en";
        const languageName = localeToLanguageName(locale);
        const endpoints = Array.isArray(currentData?.endpoints) ? currentData.endpoints : [];
        const ep1 = (endpoints[0] as { slug?: string } | null | undefined)?.slug ?? "";
        const ep2 = (endpoints[1] as { slug?: string } | null | undefined)?.slug ?? "";
        const currentDesc =
          typeof currentData?.description === "string" ? currentData.description : "";

        return `Improve the description for this culinary pairing.

Pairing: ${ep1} ↔ ${ep2}
${currentDesc ? `Current description: ${currentDesc}` : ""}

Rules:
- Write the output in ${languageName}. Do not use any other language.
- Focus on WHY these ingredients pair well — flavor harmony, culinary tradition, texture contrast
- Keep it to 1-2 sentences, vivid and informative
- Do not suggest image URLs`;
      },
      autoApply: { policy: "never" },
      presetIds: ["expand", "tone", "research"],
      translation: { mode: "translate" },
      writePolicy: "replace",
    },

    endpoints: copyField,
    image: copyField,

    // imageAttribution: copy the whole object, but the attribution prose sub-field is translated
    imageAttribution: copyField,
    "imageAttribution.attribution": {
      translation: { mode: "translate" },
    },

    // Meta field — copy as-is (featured flag is editorial, not locale-specific)
    featured: copyField,
  },
};
