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

const recipeLinkRef = z.object({
  collection: z.enum(["recipes", "spicemixes", "sauces"]),
  slug: z.string(),
});

const recipeMetaSchema = z.object({
  kind: z.enum(["recipe", "spicemix", "sauce"]).optional(),
  variantOf: z.string().optional(),
  variants: z.array(z.string()).default([]),
  goesWellWith: z.array(recipeLinkRef).default([]),
  usesBase: z.array(recipeLinkRef).default([]),
  ingredientLinks: z.array(z.object({ pattern: z.string(), slug: z.string() })).default([]),
  externalSources: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string(),
        source: z.string().optional(),
      }),
    )
    .default([]),
  tags: z.array(z.string()).default([]),
});

const ingredientSchema = z.object({
  name: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  image: z.string().url().optional(),
  category: z.enum(["spice", "herb", "seed", "dried-fruit", "salt", "acid", "allium", "other"]),
  origin: z.array(z.string()).default([]),
  flavorNotes: z.array(z.string()).default([]),
  pairings: z.array(z.object({ slug: z.string(), note: z.string().optional() })).default([]),
});

const recipes = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/recipes" }),
  schema: recipeSchema,
});

const spicemixes = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/spicemixes" }),
  schema: recipeSchema,
});

const sauces = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/sauces" }),
  schema: recipeSchema,
});

const meta = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/meta" }),
  schema: recipeMetaSchema,
});

const ingredients = defineCollection({
  // Pattern matches only locale-prefixed subdirectories: en/slug.json, de/slug.json, etc.
  // Root-level files are intentionally excluded.
  loader: glob({ pattern: "[a-z][a-z]/*.json", base: "./src/content/ingredients" }),
  schema: ingredientSchema,
});

export const collections = { recipes, spicemixes, sauces, meta, ingredients };

import type { CollectionEntry } from "astro:content";
export type Recipe = CollectionEntry<"recipes">["data"];
export type Ingredient = CollectionEntry<"ingredients">["data"];
export type RecipeMeta = CollectionEntry<"meta">["data"];
