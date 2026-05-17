import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { recipeSchema } from "recipe-ingestion";
import {
  ingredientSchema,
  ingredientMetaSchema,
  pairingSchema,
  pairingMetaSchema,
  recipeMetaSchema,
} from "entity-kind";

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
  loader: glob({ pattern: "[a-z][a-z]/[^.]+.json", base: "./src/content/pairings" }),
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

// Meta files colocated with pairings: pairings/<locale>/slug.meta.json
// IDs are "locale/slug1--slug2" e.g. "en/caraway--cumin".
const pairingMeta = defineCollection({
  loader: glob({
    pattern: "pairings/[a-z][a-z]/*.meta.json",
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
