import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { recipeSchema } from "recipe-ingestion";
import { REGIONS } from "./lib/regions.ts";
import { aiEventSchema } from "content-ai";
import { INGREDIENT_PARTS, INGREDIENT_FLAVOR_PROFILE } from "./lib/ingredient-schema.ts";
import { MIXTURE_KINDS } from "./lib/mixture-schema.ts";

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

const aiSuggestionsCacheSchema = z
  .object({
    fingerprint: z.string(),
    at: z.string(),
    model: z.string(),
    data: z.object({
      improvements: z
        .array(
          z.object({
            field: z.string(),
            suggestion: z.unknown(),
            hash: z.string().optional(),
            rationale: z.string().optional(),
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
            kind: z.string(),
            collection: z.string(),
            slug: z.string(),
            name: z.string(),
          }),
        )
        .default([]),
      detectedLanguage: z.string().optional(),
    }),
  })
  .optional();

const recipeMetaSchema = z.object({
  kind: z.enum(["recipe", ...MIXTURE_KINDS]).optional(),
  draft: z.boolean().default(false),
  region: z.array(z.enum(REGIONS)).default([]),
  language: z.string().length(2).optional(),
  locale: z.string().length(2).optional(),
  canonicalLocale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translationStaleSince: z.string().datetime().optional(),
  canonicalContentHash: z.string().optional(),
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
  aiSuggestions: aiSuggestionsCacheSchema,
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
  sources: z
    .array(
      z.object({
        author: z.string().optional(),
        title: z.string(),
        url: z.string().url(),
        year: z.string().optional(),
      }),
    )
    .optional(),
  region: z.array(z.enum(REGIONS)).default([]),
  imageAttribution: imageAttributionSchema,
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
  image: z.string().url().optional(),
  imageAttribution: imageAttributionSchema,
});

const pairingMetaSchema = z.object({
  draft: z.boolean().default(false),
  aiEvents: z.array(aiEventSchema).default([]),
});

const ingredientMetaSchema = z.object({
  draft: z.boolean().default(false),
  canonicalLocale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translationStaleSince: z.string().datetime().optional(),
  canonicalContentHash: z.string().optional(),
  translations: z.record(z.string(), z.string()).default({}),
  aiEvents: z.array(aiEventSchema).default([]),
});

// Content IDs are "locale/slug" (e.g. "en/miso-butter-ramen"), same layout as ingredients.
const recipes = defineCollection({
  loader: glob({ pattern: "[a-z][a-z]/[^.]+.json", base: "./src/content/recipes" }),
  schema: recipeSchema,
});

const mixtures = defineCollection({
  loader: glob({ pattern: "[a-z][a-z]/[^.]+.json", base: "./src/content/mixtures" }),
  schema: recipeSchema,
});

// Meta IDs are "kind/locale/slug" (e.g. "recipes/en/miso-butter-ramen").
const meta = defineCollection({
  loader: glob({
    pattern: "{recipes,mixtures}/[a-z][a-z]/*.meta.json",
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
