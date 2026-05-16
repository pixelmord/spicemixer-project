import type { FieldConfig } from "../translation.ts";

export const recipeFieldConfig: Record<string, FieldConfig> = {
  // Prose / labels → translate
  name: { translation: { mode: "translate" } },
  description: { translation: { mode: "translate" } },
  recipeCuisine: { translation: { mode: "translate" } },
  recipeCategory: { translation: { mode: "translate" } },
  recipeIngredient: { translation: { mode: "translate" } },
  recipeInstructions: { translation: { mode: "translate" } },
  // per-locale (different slug per language)
  slug: { translation: { mode: "translate" } },

  // Per-locale vocabulary → localize
  keywords: { translation: { mode: "localize" } },

  // URLs / structured data / durations → copy
  image: { translation: { mode: "copy" } },
  author: { translation: { mode: "copy" } },
  datePublished: { translation: { mode: "copy" } },
  recipeYield: { translation: { mode: "copy" } },
  prepTime: { translation: { mode: "copy" } },
  cookTime: { translation: { mode: "copy" } },
  totalTime: { translation: { mode: "copy" } },
  suitableForDiet: { translation: { mode: "copy" } },
  nutrition: { translation: { mode: "copy" } },
};
