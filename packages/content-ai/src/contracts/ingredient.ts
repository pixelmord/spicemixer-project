import type { FieldConfig } from "../translation.ts";

/**
 * Per-field translation declarations for the ingredient entity.
 * Keys use dot-bracket notation for nested array fields (sources[].url).
 * Absent fields default to { mode: "translate" } at runtime.
 */
export const ingredientFieldConfig: Record<string, FieldConfig> = {
  // Prose → translate
  name: { translation: { mode: "translate" } },
  summary: { translation: { mode: "translate" } },
  description: { translation: { mode: "translate" } },
  culinaryUse: { translation: { mode: "translate" } },
  medicinalUses: { translation: { mode: "translate" } },
  healthBenefits: { translation: { mode: "translate" } },
  safetyNotes: { translation: { mode: "translate" } },
  history: { translation: { mode: "translate" } },
  storage: { translation: { mode: "translate" } },
  sourcing: { translation: { mode: "translate" } },
  seasonality: { translation: { mode: "translate" } },
  commonNames: { translation: { mode: "translate" } },
  flavorNotes: { translation: { mode: "translate" } },
  safetyFlags: { translation: { mode: "translate" } },
  "pairings[].note": { translation: { mode: "translate" } },
  "sources[].title": { translation: { mode: "translate" } },

  // Latin / closed-enum / URLs → copy
  botanicalName: { translation: { mode: "copy" } },
  family: { translation: { mode: "copy" } },
  category: { translation: { mode: "copy" } },
  origin: { translation: { mode: "copy" } },
  region: { translation: { mode: "copy" } },
  parts: { translation: { mode: "copy" } },
  flavorProfile: { translation: { mode: "copy" } },
  images: { translation: { mode: "copy" } },
  imageAttribution: { translation: { mode: "copy" } },
  "sources[].url": { translation: { mode: "copy" } },
  "sources[].author": { translation: { mode: "copy" } },
  "sources[].year": { translation: { mode: "copy" } },
  "pairings[].slug": { translation: { mode: "copy" } },
};
