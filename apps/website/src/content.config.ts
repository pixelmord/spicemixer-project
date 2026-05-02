import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Schema kept in sync with packages/recipe-ingestion/src/schema.ts.
// Both must represent identical shapes; the ingestion package validates on ingest,
// Astro validates on build.
const isoDuration = z.string().regex(/^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/, {
  message: "Expected ISO-8601 duration like PT15M or PT2H30M",
});

const personOrOrg = z.object({
  "@type": z.enum(["Person", "Organization"]),
  name: z.string(),
  url: z.url().optional(),
});

const howToStep = z.object({
  "@type": z.literal("HowToStep"),
  text: z.string(),
  name: z.string().optional(),
  url: z.url().optional(),
  image: z.url().optional(),
});

const recipeSchema = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.literal("Recipe"),
  name: z.string(),
  description: z.string().optional(),
  image: z.union([z.url(), z.array(z.url())]).optional(),
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

const ingredientLinkItem = z.object({
  pattern: z.string(),
  kind: z.enum(["ingredient", "recipe"]).default("ingredient"),
  slug: z.string(),
  collection: z.enum(["recipes", "spicemixes", "sauces"]).optional(),
});

const aiSuggestionsSchema = z.object({
  contentHash: z.string(),
  generatedAt: z.string(),
  improvements: z
    .array(
      z.object({
        field: z.string(),
        suggestion: z.string(),
        rationale: z.string(),
      }),
    )
    .default([]),
  tags: z.array(z.string()).default([]),
  ingredientLinks: z
    .array(
      z.object({
        pattern: z.string(),
        slug: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .default([]),
  relations: z
    .array(
      z.object({
        kind: z.enum(["goesWellWith", "usesBase"]),
        collection: z.enum(["recipes", "spicemixes", "sauces"]),
        slug: z.string(),
        name: z.string(),
      }),
    )
    .default([]),
  detectedLanguage: z.string().length(2).optional(),
});

const imageAttributionSchema = z
  .object({
    source: z.string(),
    sourceUrl: z.string().url(),
    creator: z.string(),
    creatorUrl: z.string().url().optional(),
    license: z.string(),
    licenseUrl: z.string().url(),
    attribution: z.string(),
  })
  .optional();

const recipeMetaSchema = z.object({
  kind: z.enum(["recipe", "spicemix", "sauce"]).optional(),
  draft: z.boolean().default(false),
  language: z.string().length(2).optional(),
  locale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translations: z.record(z.string(), z.string()).default({}),
  variantOf: z.string().optional(),
  variants: z.array(z.string()).default([]),
  goesWellWith: z.array(recipeLinkRef).default([]),
  usesBase: z.array(recipeLinkRef).default([]),
  ingredientLinks: z.array(ingredientLinkItem).default([]),
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
  aiSuggestions: aiSuggestionsSchema.optional(),
  imageAttribution: imageAttributionSchema,
  recipeInstructionsAttribution: z
    .array(
      z.object({
        index: z.number().int(),
        source: z.string(),
        sourceUrl: z.string().url(),
        creator: z.string(),
        creatorUrl: z.string().url().optional(),
        license: z.string(),
        licenseUrl: z.string().url(),
        attribution: z.string(),
      }),
    )
    .optional(),
});

const ingredientSchema = z.object({
  name: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  image: z.string().url().optional(),
  category: z.enum(["spice", "herb", "seed", "dried-fruit", "salt", "acid", "allium", "other"]),
  origin: z.array(z.string()).default([]),
  flavorNotes: z.array(z.string()).default([]),
  // Legacy inline pairings — kept optional during migration window.
  // Canonical pairings now live in the `pairings` collection.
  pairings: z
    .array(z.object({ slug: z.string(), note: z.string().optional() }))
    .optional()
    .default([]),
});

const pairingSchema = z.object({
  ingredients: z.tuple([z.string(), z.string()]),
  // Locale-keyed descriptions map (e.g. { en: "...", de: "..." })
  descriptions: z.record(z.string(), z.string()).default({}),
  // Legacy single-locale field — kept optional during migration window
  description: z.string().optional(),
  draft: z.boolean().default(false),
  image: z.string().url().optional(),
});

const pairingAiBlockSchema = z.object({
  contentHash: z.string(),
  generatedAt: z.string(),
  improvements: z
    .array(z.object({ field: z.string(), suggestion: z.string(), rationale: z.string() }))
    .default([]),
  detectedLanguage: z.string().length(2).optional(),
});

const pairingMetaSchema = z.object({
  aiSuggestions: z.record(z.string(), pairingAiBlockSchema).optional(),
  imageAttribution: imageAttributionSchema,
});

const aiIngredientSuggestionsSchema = z.object({
  contentHash: z.string(),
  generatedAt: z.string(),
  improvements: z
    .array(z.object({ field: z.string(), suggestion: z.string(), rationale: z.string() }))
    .default([]),
  pairings: z
    .array(
      z.object({
        slug: z.string(),
        description: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .default([]),
  detectedLanguage: z.string().length(2).optional(),
  languageMismatch: z.boolean().default(false),
});

const ingredientMetaSchema = z.object({
  kind: z.literal("ingredient").default("ingredient"),
  translationOf: z.string().optional(),
  translations: z.record(z.string(), z.string()).default({}),
  aiSuggestions: aiIngredientSuggestionsSchema.optional(),
  imageAttribution: imageAttributionSchema,
});

const recipes = defineCollection({
  loader: glob({ pattern: "[^.]+.json", base: "./src/content/recipes" }),
  schema: recipeSchema,
});

const spicemixes = defineCollection({
  loader: glob({ pattern: "[^.]+.json", base: "./src/content/spicemixes" }),
  schema: recipeSchema,
});

const sauces = defineCollection({
  loader: glob({ pattern: "[^.]+.json", base: "./src/content/sauces" }),
  schema: recipeSchema,
});

// Meta files colocated with content: recipes/slug.meta.json, sauces/slug.meta.json, etc.
// IDs are "recipes/slug", "sauces/slug", "spicemixes/slug" — same as before.
const meta = defineCollection({
  loader: glob({
    pattern: "{recipes,sauces,spicemixes}/*.meta.json",
    base: "./src/content",
    generateId: ({ entry }) => entry.replace(".meta.json", ""),
  }),
  schema: recipeMetaSchema,
});

const ingredients = defineCollection({
  loader: glob({ pattern: "[a-z][a-z]/[^.]+.json", base: "./src/content/ingredients" }),
  schema: ingredientSchema,
});

const pairings = defineCollection({
  loader: glob({ pattern: "[^.]+.json", base: "./src/content/pairings" }),
  schema: pairingSchema,
});

// Meta files colocated with ingredients: ingredients/en/slug.meta.json
// IDs are "en/slug", "de/slug" — same as before.
const ingredientMeta = defineCollection({
  loader: glob({
    pattern: "ingredients/[a-z][a-z]/*.meta.json",
    base: "./src/content",
    generateId: ({ entry }) => entry.replace("ingredients/", "").replace(".meta.json", ""),
  }),
  schema: ingredientMetaSchema,
});

// Meta files colocated with pairings: pairings/slug.meta.json
// IDs are "slug1--slug2" — same as before.
const pairingMeta = defineCollection({
  loader: glob({
    pattern: "pairings/*.meta.json",
    base: "./src/content",
    generateId: ({ entry }) => entry.replace("pairings/", "").replace(".meta.json", ""),
  }),
  schema: pairingMetaSchema,
});

export const collections = {
  recipes,
  spicemixes,
  sauces,
  meta,
  ingredients,
  pairings,
  ingredientMeta,
  pairingMeta,
};

import type { CollectionEntry } from "astro:content";
export type Recipe = CollectionEntry<"recipes">["data"];
export type Ingredient = CollectionEntry<"ingredients">["data"];
export type RecipeMeta = CollectionEntry<"meta">["data"];
export type Pairing = CollectionEntry<"pairings">["data"];
export type IngredientMeta = CollectionEntry<"ingredientMeta">["data"];
export type PairingMeta = CollectionEntry<"pairingMeta">["data"];
