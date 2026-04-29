import { z } from "zod";

export const ingredientExtractSchema = z.object({
  name: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  category: z
    .enum(["spice", "herb", "seed", "dried-fruit", "salt", "acid", "allium", "other"])
    .optional(),
  origin: z.array(z.string()).optional(),
  flavorNotes: z.array(z.string()).optional(),
});

export type IngredientExtract = z.infer<typeof ingredientExtractSchema>;
