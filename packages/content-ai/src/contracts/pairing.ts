import type { FieldConfig } from "../translation.ts";

/**
 * Per-field translation declarations for the pairing entity.
 * ingredients tuple holds slugs (shared across locales) → copy.
 * slug is not a fillable field for pairings.
 * Absent fields default to { mode: "translate" } at runtime.
 */
export const pairingFieldConfig: Record<string, FieldConfig> = {
  // Prose → translate
  description: { translation: { mode: "translate" } },

  // URLs / slugs → copy
  image: { translation: { mode: "copy" } },
  imageAttribution: { translation: { mode: "copy" } },
  ingredients: { translation: { mode: "copy" } },
};
