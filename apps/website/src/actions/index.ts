import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { createStore } from "@/lib/content-store.ts";
import { fetchRecipe } from "recipe-ingestion";
import { scoreRecipe, scoreIngredient } from "@/lib/completeness.ts";

const recipeCollectionEnum = z.enum(["recipes", "spicemixes", "sauces"]);

// ──────────────────────────────────────────────
// Helper: build the combined listing used by the content table
// ──────────────────────────────────────────────

async function buildListing() {
  const store = await createStore();
  const [recipes, spicemixes, sauces, metas, ingredients] = await Promise.all([
    store.list("recipes"),
    store.list("spicemixes"),
    store.list("sauces"),
    store.list("meta"),
    store.list("ingredients"),
  ]);

  const metaMap = new Map(metas.map((m) => [m.id, m.data as Record<string, unknown>]));

  const recipeItems = [...recipes, ...spicemixes, ...sauces].map((item) => {
    const collection = item.collection as "recipes" | "spicemixes" | "sauces";
    const metaId = `${collection}/${item.id}`;
    const meta = metaMap.get(metaId) ?? {};
    const completeness = scoreRecipe(item.data as Record<string, unknown>, meta);
    return {
      type: "recipe" as const,
      collection,
      id: item.id,
      name: (item.data as Record<string, unknown>).name ?? item.id,
      draft: !!(meta as Record<string, unknown>).draft,
      completeness,
      updatedAt: item.updatedAt,
    };
  });

  const ingredientItems = ingredients.map((item) => {
    const completeness = scoreIngredient(item.data as Record<string, unknown>);
    return {
      type: "ingredient" as const,
      collection: "ingredients" as const,
      id: item.id,
      name: (item.data as Record<string, unknown>).name ?? item.id,
      draft: false,
      completeness,
      updatedAt: item.updatedAt,
    };
  });

  return [...recipeItems, ...ingredientItems];
}

// ──────────────────────────────────────────────
// Actions
// ──────────────────────────────────────────────

export const server = {
  /** List all content items across all collections with completeness scores. */
  listAll: defineAction({
    handler: async () => buildListing(),
  }),

  /** Fetch a single content item + its meta (if applicable). */
  getItem: defineAction({
    input: z.object({
      collection: z.enum(["recipes", "spicemixes", "sauces", "ingredients", "meta"]),
      id: z.string(),
    }),
    handler: async ({ collection, id }) => {
      const store = await createStore();
      const item = await store.get(collection, id);
      if (!item) return null;
      // For recipe collections also fetch the meta sidecar
      if (collection === "recipes" || collection === "spicemixes" || collection === "sauces") {
        const meta = await store.get("meta", `${collection}/${id}`);
        return { item, meta: meta?.data ?? null };
      }
      return { item, meta: null };
    },
  }),

  /** Save (create or update) a recipe-shaped content item + its meta sidecar. */
  saveRecipe: defineAction({
    accept: "json",
    input: z.object({
      collection: recipeCollectionEnum,
      slug: z.string().min(1),
      recipe: z.record(z.string(), z.unknown()),
      meta: z.record(z.string(), z.unknown()).optional(),
    }),
    handler: async ({ collection, slug, recipe, meta }) => {
      const store = await createStore();
      await store.put(collection, slug, recipe);
      if (meta !== undefined) {
        await store.put("meta", `${collection}/${slug}`, meta);
      }
      return { ok: true, slug };
    },
  }),

  /** Save (create or update) an ingredient for a given locale. */
  saveIngredient: defineAction({
    accept: "json",
    input: z.object({
      locale: z.enum(["en", "de"]),
      slug: z.string().min(1),
      ingredient: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ locale, slug, ingredient }) => {
      const store = await createStore();
      await store.put("ingredients", `${locale}/${slug}`, ingredient);
      return { ok: true, slug };
    },
  }),

  /** Delete a content item (and its meta sidecar if it's a recipe collection). */
  deleteItem: defineAction({
    input: z.object({
      collection: z.enum(["recipes", "spicemixes", "sauces", "ingredients"]),
      id: z.string(),
    }),
    handler: async ({ collection, id }) => {
      const store = await createStore();
      await store.delete(collection, id);
      if (collection !== "ingredients") {
        await store.delete("meta", `${collection}/${id}`);
      }
      return { ok: true };
    },
  }),

  /** Set meta.draft = false (publish). */
  publish: defineAction({
    input: z.object({ collection: recipeCollectionEnum, id: z.string() }),
    handler: async ({ collection, id }) => {
      const store = await createStore();
      const metaId = `${collection}/${id}`;
      const existing = await store.get("meta", metaId);
      const meta = (existing?.data as Record<string, unknown>) ?? {};
      await store.put("meta", metaId, { ...meta, draft: false });
      return { ok: true };
    },
  }),

  /** Set meta.draft = true (unpublish). */
  unpublish: defineAction({
    input: z.object({ collection: recipeCollectionEnum, id: z.string() }),
    handler: async ({ collection, id }) => {
      const store = await createStore();
      const metaId = `${collection}/${id}`;
      const existing = await store.get("meta", metaId);
      const meta = (existing?.data as Record<string, unknown>) ?? {};
      await store.put("meta", metaId, { ...meta, draft: true });
      return { ok: true };
    },
  }),

  /**
   * Fetch and normalise a recipe from a 3rd-party URL.
   * Returns the normalised Recipe and IngestResult metadata for the import widget.
   */
  ingestUrl: defineAction({
    input: z.object({ url: z.string().url() }),
    handler: async ({ url }) => {
      const result = await fetchRecipe(url);
      return {
        recipe: result.recipe,
        source: result.source,
        warnings: result.warnings,
      };
    },
  }),
};
