import { z } from "zod";
import { recipeSchema } from "recipe-ingestion";
import { aiEventSchema } from "content-ai";

export { recipeSchema };
export type { Recipe } from "recipe-ingestion";

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

// ── Mixture constants ─────────────────────────────────────────────────────────

export const MIXTURE_KINDS = [
  "spicemix",
  "sauce",
  "rub",
  "oil",
  "pickle",
  "chutney",
  "marinade",
] as const;

export type MixtureKind = (typeof MIXTURE_KINDS)[number];

// ── Ingredient constants ───────────────────────────────────────────────────────

export const REGIONS = [
  "north-africa",
  "east-africa",
  "horn-of-africa",
  "west-africa",
  "southern-africa",
  "levant",
  "gulf",
  "caucasus",
  "mediterranean",
  "western-europe",
  "central-europe",
  "central-asia",
  "south-asia",
  "southeast-asia",
  "east-asia",
  "north-america",
  "mesoamerica",
  "caribbean",
  "andean",
  "south-atlantic",
] as const;

export type RegionCode = (typeof REGIONS)[number];

export const INGREDIENT_PARTS = [
  "seed",
  "leaf",
  "root",
  "bark",
  "fruit",
  "flower",
  "bulb",
  "rhizome",
] as const;

export const INGREDIENT_FLAVOR_PROFILE = [
  "warm",
  "citrusy",
  "bitter",
  "pungent",
  "sweet",
  "earthy",
  "floral",
  "herbaceous",
  "smoky",
  "umami",
  "sour",
] as const;

export const INGREDIENT_CATEGORIES = [
  "spice",
  "herb",
  "seed",
  "dried-fruit",
  "salt",
  "acid",
  "allium",
  "other",
] as const;

// ── Ingredient schema ─────────────────────────────────────────────────────────

export const ingredientSchema = z.object({
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
  category: z.enum(INGREDIENT_CATEGORIES),
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
});

export type Ingredient = z.infer<typeof ingredientSchema>;

// ── Pairing schema ────────────────────────────────────────────────────────────

export const ENDPOINT_COLLECTIONS = ["ingredients", "mixtures", "recipes"] as const;

export const endpointRefSchema = z.object({
  collection: z.enum(ENDPOINT_COLLECTIONS),
  slug: z.string(),
});

export type EndpointRef = z.infer<typeof endpointRefSchema>;

export const pairingSchema = z.object({
  endpoints: z.tuple([endpointRefSchema, endpointRefSchema]),
  description: z.string(),
  image: z.string().url().optional(),
  imageAttribution: imageAttributionSchema,
});

export type Pairing = z.infer<typeof pairingSchema>;

// ── Ingredient meta schema ────────────────────────────────────────────────────

export const ingredientMetaSchema = z.object({
  draft: z.boolean().default(false),
  canonicalLocale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translationStaleSince: z.string().datetime().optional(),
  canonicalContentHash: z.string().optional(),
  canonicalFieldHashes: z.record(z.string(), z.string()).optional(),
  translations: z.record(z.string(), z.string()).default({}),
  aiEvents: z.array(aiEventSchema).default([]),
});

export type IngredientMeta = z.infer<typeof ingredientMetaSchema>;

// ── Pairing meta schema ───────────────────────────────────────────────────────

export const pairingMetaSchema = z.object({
  draft: z.boolean().default(false),
  canonicalLocale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translationStaleSince: z.string().datetime().optional(),
  canonicalContentHash: z.string().optional(),
  canonicalFieldHashes: z.record(z.string(), z.string()).optional(),
  translations: z.record(z.string(), z.string()).default({}),
  aiEvents: z.array(aiEventSchema).default([]),
  featured: z.boolean().default(false),
});

export type PairingMeta = z.infer<typeof pairingMetaSchema>;

// ── Recipe meta schema ────────────────────────────────────────────────────────

const ingredientLinkItem = z.object({
  pattern: z.string(),
  kind: z.enum(["ingredient", "recipe"]).default("ingredient"),
  slug: z.string(),
  collection: z.enum(["ingredients", "mixtures"]).optional(),
});

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
      pairings: z
        .array(
          z.object({
            otherCollection: z.enum(["ingredients", "mixtures", "recipes"]),
            otherSlug: z.string(),
            rationale: z.string(),
            traceId: z.string().optional(),
          }),
        )
        .default([]),
      detectedLanguage: z.string().optional(),
    }),
  })
  .optional();

export const recipeMetaSchema = z.object({
  kind: z.enum(["recipe", ...MIXTURE_KINDS]).optional(),
  draft: z.boolean().default(false),
  region: z.array(z.enum(REGIONS)).default([]),
  language: z.string().length(2).optional(),
  locale: z.string().length(2).optional(),
  canonicalLocale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translationStaleSince: z.string().datetime().optional(),
  canonicalContentHash: z.string().optional(),
  canonicalFieldHashes: z.record(z.string(), z.string()).optional(),
  translations: z.record(z.string(), z.string()).default({}),
  variants: z.array(z.string()).default([]),
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

export type RecipeMeta = z.infer<typeof recipeMetaSchema>;
