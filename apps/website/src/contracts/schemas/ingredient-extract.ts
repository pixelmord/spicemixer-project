import { z } from "zod";
import { unwrapSchemaShaped } from "./preprocess.ts";

const ingredientExtractInner = z.object({
  name: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  category: z
    .enum(["spice", "herb", "seed", "dried-fruit", "salt", "acid", "allium", "other"])
    .optional(),
  origin: z.array(z.string()).optional(),
  flavorNotes: z.array(z.string()).optional(),
});

export const ingredientExtractSchema = z.preprocess(unwrapSchemaShaped, ingredientExtractInner);

export type IngredientExtract = z.infer<typeof ingredientExtractInner>;
