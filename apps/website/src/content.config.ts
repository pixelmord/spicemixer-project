import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { recipeSchema } from "recipe-ingestion";
import { REGIONS } from "./lib/regions.ts";
import { aiEventSchema } from "content-ai";
import { INGREDIENT_PARTS, INGREDIENT_FLAVOR_PROFILE } from "./lib/ingredient-schema.ts";

const recipeLinkRef = z.object({
  collection: z.enum(["recipes", "ingredients", "mixtures"]),
  slug: z.string(),
});

const ingredientLinkItem = z.object({
  pattern: z.string(),
  kind: z.enum(["ingredient", "recipe"]).default("ingredient"),
  slug: z.string(),
  collection: z.enum(["ingredients", "mixtures"]).optional(),
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
  region: z.array(z.enum(REGIONS)).default([]),
  language: z.string().length(2).optional(),
  locale: z.string().length(2).optional(),
  canonicalLocale: z.string().length(2).optional(),
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
  aiEvents: z.array(aiEventSchema).default([]),
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
  culinaryUse: z.string().optional(),
  medicinalUses: z.string().optional(),
  healthBenefits: z.string().optional(),
  safetyNotes: z.string().optional(),
  history: z.string().optional(),
  storage: z.string().optional(),
  sourcing: z.string().optional(),
  images: z.array(z.string().url()).default([]),
  category: z.enum(["spice", "herb", "seed", "dried-fruit", "salt", "acid", "allium", "other"]),
  origin: z.array(z.string()).default([]),
  flavorNotes: z.array(z.string()).default([]),
  commonNames: z.array(z.string()).default([]),
  botanicalName: z.string().optional(),
  family: z.string().optional(),
  parts: z.array(z.enum(INGREDIENT_PARTS)).optional(),
  seasonality: z.string().optional(),
  flavorProfile: z.array(z.enum(INGREDIENT_FLAVOR_PROFILE)).optional(),
  safetyFlags: z.array(z.string()).optional(),
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

const pairingMetaSchema = z.object({
  aiEvents: z.array(aiEventSchema).default([]),
  imageAttribution: imageAttributionSchema,
});

const ingredientMetaSchema = z.object({
  kind: z.literal("ingredient").default("ingredient"),
  draft: z.boolean().default(false),
  region: z.array(z.enum(REGIONS)).default([]),
  canonicalLocale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translations: z.record(z.string(), z.string()).default({}),
  aiEvents: z.array(aiEventSchema).default([]),
  imageAttribution: imageAttributionSchema,
});

const recipes = defineCollection({
  loader: glob({ pattern: "[^.]+.json", base: "./src/content/recipes" }),
  schema: recipeSchema,
});

const mixtures = defineCollection({
  loader: glob({ pattern: "[^.]+.json", base: "./src/content/mixtures" }),
  schema: recipeSchema,
});

// Meta files colocated with content: recipes/slug.meta.json, mixtures/slug.meta.json, etc.
// IDs are "recipes/slug", "mixtures/slug" — same as before.
const meta = defineCollection({
  loader: glob({
    pattern: "{recipes,mixtures}/*.meta.json",
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
  mixtures,
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
