import type { FieldConfig } from "../translation.ts";

export const pairingFieldConfig: Record<string, FieldConfig> = {
  // Prose → translate
  description: { translation: { mode: "translate" } },

  // URLs / slugs → copy
  image: { translation: { mode: "copy" } },
  imageAttribution: { translation: { mode: "copy" } },
  ingredients: { translation: { mode: "copy" } },
};
