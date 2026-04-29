import { z } from "zod";

export const recipeExtractSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  recipeYield: z.string().optional(),
  prepTime: z.string().optional(),
  cookTime: z.string().optional(),
  totalTime: z.string().optional(),
  recipeCategory: z.string().optional(),
  recipeCuisine: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  recipeIngredient: z.array(z.string()),
  recipeInstructions: z.array(
    z.object({
      text: z.string(),
      name: z.string().optional(),
    }),
  ),
});

export type RecipeExtract = z.infer<typeof recipeExtractSchema>;
