import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const isoDuration = z.string().regex(/^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/, {
  message: "Expected ISO-8601 duration like PT15M or PT2H30M",
});

const personOrOrg = z.object({
  "@type": z.enum(["Person", "Organization"]),
  name: z.string(),
  url: z.string().url().optional(),
});

const howToStep = z.object({
  "@type": z.literal("HowToStep"),
  text: z.string(),
  name: z.string().optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});

const recipeSchema = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.literal("Recipe"),
  name: z.string(),
  description: z.string().optional(),
  image: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  author: z.union([personOrOrg, z.array(personOrOrg)]).optional(),
  datePublished: z.string().optional(),
  recipeYield: z.union([z.string(), z.number()]).optional(),
  recipeCategory: z.string().optional(),
  recipeCuisine: z.string().optional(),
  keywords: z.union([z.string(), z.array(z.string())]).optional(),
  suitableForDiet: z.union([z.string(), z.array(z.string())]).optional(),
  prepTime: isoDuration.optional(),
  cookTime: isoDuration.optional(),
  totalTime: isoDuration.optional(),
  recipeIngredient: z.array(z.string()).min(1),
  recipeInstructions: z.union([z.array(z.string()), z.array(howToStep)]),
  nutrition: z
    .object({
      "@type": z.literal("NutritionInformation"),
      calories: z.string().optional(),
      proteinContent: z.string().optional(),
      fatContent: z.string().optional(),
      carbohydrateContent: z.string().optional(),
      servingSize: z.string().optional(),
    })
    .optional(),
});

const recipes = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/recipes" }),
  schema: recipeSchema,
});

export const collections = { recipes };

import type { CollectionEntry } from "astro:content";
export type Recipe = CollectionEntry<"recipes">["data"];
