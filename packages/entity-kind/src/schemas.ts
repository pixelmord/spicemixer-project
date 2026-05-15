import { z } from "zod";
import { recipeSchema } from "recipe-ingestion";

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
  images: z.array(z.string()).default([]),
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
        url: z.string(),
        year: z.string().optional(),
      }),
    )
    .optional(),
  region: z.array(z.enum(REGIONS)).default([]),
  imageAttribution: imageAttributionSchema,
  pairings: z
    .array(z.object({ slug: z.string(), note: z.string().optional() }))
    .optional()
    .default([]),
});

export type Ingredient = z.infer<typeof ingredientSchema>;

// ── Pairing schema ────────────────────────────────────────────────────────────

export const pairingSchema = z.object({
  ingredients: z.tuple([z.string(), z.string()]),
  descriptions: z.record(z.string(), z.string()).default({}),
  description: z.string().optional(),
  image: z.string().optional(),
  imageAttribution: imageAttributionSchema,
});

export type Pairing = z.infer<typeof pairingSchema>;
