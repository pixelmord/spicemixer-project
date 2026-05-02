import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { createStore } from "@/lib/content-store.ts";
import { fetchRecipe } from "recipe-ingestion";
import { scoreRecipe, scoreIngredient, scorePairing } from "@/lib/completeness.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const fileOrTextInput = z.object({
  file: z.instanceof(File).optional(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
});

type ContentAiFileInput =
  | { kind: "text"; content: string }
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; mimeType: string };

async function resolveFileInput({
  file,
  mimeType,
  text,
}: z.infer<typeof fileOrTextInput>): Promise<ContentAiFileInput> {
  if (text) return { kind: "text", content: text };
  if (!file || !mimeType) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Provide a file or text." });
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ActionError({ code: "BAD_REQUEST", message: "File exceeds 10 MB limit." });
  }
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return { kind: "text", content: await file.text() };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mimeType === "application/pdf") return { kind: "pdf", bytes };
  return { kind: "image", bytes, mimeType };
}

function resolveAiConfig() {
  const apiKey =
    process.env["AI_API_KEY"] ??
    process.env["OPENAI_API_KEY"] ??
    import.meta.env["AI_API_KEY"] ??
    import.meta.env["OPENAI_API_KEY"] ??
    "";
  if (!apiKey) {
    const visible =
      Object.keys(process.env)
        .filter((k) => k.includes("AI_") || k.includes("OPENAI"))
        .join(", ") || "(none)";
    throw new ActionError({
      code: "FORBIDDEN",
      message: `AI features require AI_API_KEY or OPENAI_API_KEY. Visible env keys: ${visible}`,
    });
  }
  return {
    baseUrl:
      process.env["AI_BASE_URL"] ?? import.meta.env["AI_BASE_URL"] ?? "https://api.openai.com/v1",
    apiKey,
    model: process.env["AI_MODEL"] ?? import.meta.env["AI_MODEL"] ?? "gpt-4o-mini",
  };
}

const recipeCollectionEnum = z.enum(["recipes", "spicemixes", "sauces"]);

// ──────────────────────────────────────────────
// Helper: build the combined listing used by the content table
// ──────────────────────────────────────────────

async function buildListing() {
  const store = await createStore();
  const [recipes, spicemixes, sauces, metas, ingredients, pairings] = await Promise.all([
    store.list("recipes"),
    store.list("spicemixes"),
    store.list("sauces"),
    store.list("meta"),
    store.list("ingredients"),
    store.list("pairings"),
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

  const pairingItems = pairings.map((item) => {
    const d = item.data as Record<string, unknown>;
    const ings = (d["ingredients"] as string[]) ?? [];
    const descriptions = (d["descriptions"] as Record<string, string>) ?? {};
    const completeness = scorePairing(d, "en");
    const translations = ["en", "de"].filter((l) => !!descriptions[l]);
    const description = descriptions["en"] ?? String(d["description"] ?? "");
    return {
      type: "pairing" as const,
      collection: "pairings" as const,
      id: item.id,
      name: `${ings[0] ?? "?"} ↔ ${ings[1] ?? "?"}`,
      draft: !!(d["draft"] as boolean),
      completeness,
      updatedAt: item.updatedAt,
      translations,
      subtitle: description
        ? description.slice(0, 100) + (description.length > 100 ? "…" : "")
        : undefined,
    };
  });

  return [...recipeItems, ...ingredientItems, ...pairingItems];
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

  /** Upsert a pairing entity. id = slug-a--slug-b (alphabetical). */
  savePairing: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      ingredients: z.tuple([z.string(), z.string()]),
      description: z.string().min(1),
      locale: z.string().length(2).default("en"),
      draft: z.boolean().optional(),
      image: z.string().optional(),
    }),
    handler: async ({ id, ingredients, description, locale, draft, image }) => {
      const store = await createStore();
      const canonical = [...ingredients].sort() as [string, string];
      const existing = await store.get("pairings", id);
      const existingData = (existing?.data as Record<string, unknown>) ?? {};
      const existingDescriptions =
        (existingData["descriptions"] as Record<string, string>) ??
        (existingData["description"] ? { en: String(existingData["description"]) } : {});
      const existingDraft = (existingData["draft"] as boolean) ?? false;
      // image: explicit value wins; undefined = preserve existing; "" = clear
      const imageValue =
        image !== undefined ? image : (existingData["image"] as string | undefined);
      const pairingData: Record<string, unknown> = {
        ingredients: canonical,
        descriptions: { ...existingDescriptions, [locale]: description },
        draft: draft !== undefined ? draft : existingDraft,
      };
      if (imageValue) pairingData["image"] = imageValue;
      await store.put("pairings", id, pairingData);
      return { ok: true, id };
    },
  }),

  /** Toggle draft/published state for a pairing. */
  togglePairingDraft: defineAction({
    accept: "json",
    input: z.object({ id: z.string().min(1), draft: z.boolean() }),
    handler: async ({ id, draft }) => {
      const store = await createStore();
      const existing = await store.get("pairings", id);
      if (!existing)
        throw new ActionError({ code: "NOT_FOUND", message: `Pairing ${id} not found.` });
      await store.put("pairings", id, { ...(existing.data as Record<string, unknown>), draft });
      return { ok: true };
    },
  }),

  /** Delete a pairing entity by id. */
  deletePairing: defineAction({
    accept: "json",
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }) => {
      const store = await createStore();
      await store.delete("pairings", id);
      await store.delete("pairingMeta", id);
      return { ok: true };
    },
  }),

  /** List all pairing entities (all locales' descriptions). */
  listAllPairings: defineAction({
    handler: async () => {
      const store = await createStore();
      const all = await store.list("pairings");
      return all.map((item) => {
        const d = item.data as Record<string, unknown>;
        return {
          id: item.id,
          ingredients: d["ingredients"] as [string, string],
          descriptions:
            (d["descriptions"] as Record<string, string>) ??
            (d["description"] ? { en: String(d["description"]) } : {}),
          updatedAt: item.updatedAt,
        };
      });
    },
  }),

  /** List all pairing entities that include a given ingredient slug. */
  listPairingsFor: defineAction({
    accept: "json",
    input: z.object({ slug: z.string().min(1) }),
    handler: async ({ slug }) => {
      const store = await createStore();
      const all = await store.list("pairings");
      return all
        .filter((item) => {
          const d = item.data as Record<string, unknown>;
          const ings = d["ingredients"];
          return Array.isArray(ings) && ings.includes(slug);
        })
        .map((item) => {
          const d = item.data as Record<string, unknown>;
          const descriptions =
            (d["descriptions"] as Record<string, string>) ??
            (d["description"] ? { en: String(d["description"]) } : {});
          return {
            id: item.id,
            ingredients: d["ingredients"] as [string, string],
            descriptions,
          };
        });
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
    input: z.object({ url: z.url() }),
    handler: async ({ url }) => {
      const result = await fetchRecipe(url);
      return {
        recipe: result.recipe,
        source: result.source,
        warnings: result.warnings,
        language: result.language,
      };
    },
  }),

  /** Return a flat list of ingredient slugs + names for use in combobox fields. */
  listIngredientOptions: defineAction({
    input: z.object({ locale: z.enum(["en", "de"]).default("en") }),
    handler: async ({ locale }) => {
      const store = await createStore();
      const items = await store.list("ingredients");
      return items
        .filter((item) => item.id.startsWith(`${locale}/`))
        .map((item) => ({
          slug: item.id.slice(3),
          name: String((item.data as Record<string, unknown>).name ?? item.id.slice(3)),
        }));
    },
  }),

  /** Return a flat list of recipe/spicemix/sauce slugs + names for use in combobox fields. */
  listRecipeOptions: defineAction({
    handler: async () => {
      const store = await createStore();
      const [recipes, spicemixes, sauces] = await Promise.all([
        store.list("recipes"),
        store.list("spicemixes"),
        store.list("sauces"),
      ]);
      return [
        ...recipes.map((item) => ({
          collection: "recipes" as const,
          slug: item.id,
          name: String((item.data as Record<string, unknown>).name ?? item.id),
        })),
        ...spicemixes.map((item) => ({
          collection: "spicemixes" as const,
          slug: item.id,
          name: String((item.data as Record<string, unknown>).name ?? item.id),
        })),
        ...sauces.map((item) => ({
          collection: "sauces" as const,
          slug: item.id,
          name: String((item.data as Record<string, unknown>).name ?? item.id),
        })),
      ];
    },
  }),

  /** Aggregate all tags from all meta sidecars for tag autocomplete suggestions. */
  listAllTags: defineAction({
    handler: async () => {
      const store = await createStore();
      const metas = await store.list("meta");
      const tagSet = new Set<string>();
      for (const meta of metas) {
        const tags = (meta.data as Record<string, unknown>).tags;
        if (Array.isArray(tags)) tags.forEach((t) => typeof t === "string" && tagSet.add(t));
      }
      return Array.from(tagSet).sort();
    },
  }),

  /** Create a minimal ingredient stub (name + category) for inline "create new" flow. */
  quickCreateIngredient: defineAction({
    accept: "json",
    input: z.object({
      locale: z.enum(["en", "de"]),
      slug: z.string().min(1),
      name: z.string().min(1),
      category: z.string().default("other"),
    }),
    handler: async ({ locale, slug, name, category }) => {
      const store = await createStore();
      await store.put("ingredients", `${locale}/${slug}`, {
        name,
        category,
        origin: [],
        flavorNotes: [],
        pairings: [],
      });
      return { ok: true, slug };
    },
  }),

  // ──────────────────────────────────────────────
  // AI: File ingestion
  // ──────────────────────────────────────────────

  /** Extract a Recipe from an uploaded file (PDF/image/text) or pasted text. */
  aiExtractRecipe: defineAction({
    accept: "form",
    input: fileOrTextInput,
    handler: async (input) => {
      const config = resolveAiConfig();
      const { extractRecipeFromFile } = await import("content-ai");
      return extractRecipeFromFile(await resolveFileInput(input), config);
    },
  }),

  /** Extract an Ingredient from an uploaded file (PDF/image/text) or pasted text. */
  aiExtractIngredient: defineAction({
    accept: "form",
    input: fileOrTextInput,
    handler: async (input) => {
      const config = resolveAiConfig();
      const { extractIngredientFromFile } = await import("content-ai");
      return extractIngredientFromFile(await resolveFileInput(input), config);
    },
  }),

  /** Generate a new Recipe from a prompt. */
  aiGenerateRecipe: defineAction({
    accept: "json",
    input: z.object({
      prompt: z.string().min(3),
      locale: z.enum(["en", "de"]).default("en"),
      style: z.enum(["recipe", "spicemix", "sauce"]).default("recipe"),
    }),
    handler: async ({ prompt, locale, style }) => {
      const config = resolveAiConfig();
      const { generateRecipeFromPrompt } = await import("content-ai");
      return generateRecipeFromPrompt({ prompt, locale, style }, config);
    },
  }),

  /** Merge new content into an existing recipe and return the proposed merged version. */
  aiMergeRecipe: defineAction({
    accept: "form",
    input: z.object({
      existing: z.string(), // JSON-stringified existing recipe
      sourceKind: z.enum(["file", "text", "prompt"]),
      file: z.instanceof(File).optional(),
      mimeType: z.string().optional(),
      text: z.string().optional(),
      prompt: z.string().optional(),
    }),
    handler: async ({ existing, sourceKind, file, mimeType, text, prompt }) => {
      const config = resolveAiConfig();
      const { mergeRecipe } = await import("content-ai");
      const existingRecipe = JSON.parse(existing) as Record<string, unknown>;

      if (sourceKind === "prompt") {
        if (!prompt) throw new ActionError({ code: "BAD_REQUEST", message: "Prompt required." });
        return mergeRecipe(
          { existing: existingRecipe as never, source: { kind: "prompt", prompt } },
          config,
        );
      }
      if (sourceKind === "text") {
        if (!text) throw new ActionError({ code: "BAD_REQUEST", message: "Text required." });
        return mergeRecipe(
          { existing: existingRecipe as never, source: { kind: "text", content: text } },
          config,
        );
      }
      // file
      if (!file || !mimeType) {
        throw new ActionError({ code: "BAD_REQUEST", message: "File required." });
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new ActionError({ code: "BAD_REQUEST", message: "File exceeds 10 MB limit." });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (mimeType === "text/plain" || mimeType === "text/markdown") {
        const content = await file.text();
        return mergeRecipe(
          { existing: existingRecipe as never, source: { kind: "text", content } },
          config,
        );
      }
      const kind = mimeType === "application/pdf" ? "pdf" : "image";
      const source =
        kind === "pdf" ? ({ kind, bytes } as const) : ({ kind, bytes, mimeType } as const);
      return mergeRecipe({ existing: existingRecipe as never, source }, config);
    },
  }),

  // ──────────────────────────────────────────────
  // AI: Recipe curation
  // ──────────────────────────────────────────────

  /** Propose ingredientLinks by matching ingredient strings to the slug inventory. */
  aiProposeIngredientLinks: defineAction({
    accept: "json",
    input: z.object({
      recipeIngredients: z.array(z.string()),
      locale: z.enum(["en", "de"]).default("en"),
    }),
    handler: async ({ recipeIngredients, locale }) => {
      const config = resolveAiConfig();
      const store = await createStore();
      const items = await store.list("ingredients");
      const inventory = items
        .filter((i) => i.id.startsWith(`${locale}/`))
        .map((i) => ({
          slug: i.id.slice(3),
          name: String((i.data as Record<string, unknown>)["name"] ?? i.id.slice(3)),
        }));
      const { proposeIngredientLinks } = await import("content-ai");
      return proposeIngredientLinks(recipeIngredients, inventory, config);
    },
  }),

  /** Propose tags for a recipe. */
  aiProposeTags: defineAction({
    accept: "json",
    input: z.object({
      recipe: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ recipe }) => {
      const config = resolveAiConfig();
      const store = await createStore();
      const metas = await store.list("meta");
      const tagSet = new Set<string>();
      for (const meta of metas) {
        const tags = (meta.data as Record<string, unknown>)["tags"];
        if (Array.isArray(tags)) tags.forEach((t) => typeof t === "string" && tagSet.add(t));
      }
      const { proposeTags } = await import("content-ai");
      return proposeTags(recipe as never, Array.from(tagSet), config);
    },
  }),

  /** Propose values for missing/weak recipe fields. */
  aiProposeRecipeImprovements: defineAction({
    accept: "json",
    input: z.object({
      recipe: z.record(z.string(), z.unknown()),
      missingFields: z.array(z.string()),
    }),
    handler: async ({ recipe, missingFields }) => {
      const config = resolveAiConfig();
      const { proposeRecipeImprovements } = await import("content-ai");
      return proposeRecipeImprovements(recipe as never, missingFields, config);
    },
  }),

  /** Draft a translation of recipe text fields into targetLocale. */
  aiTranslateRecipe: defineAction({
    accept: "json",
    input: z.object({
      recipe: z.record(z.string(), z.unknown()),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
    }),
    handler: async ({ recipe, sourceLocale, targetLocale }) => {
      const config = resolveAiConfig();
      const { proposeRecipeTranslation } = await import("content-ai");
      return proposeRecipeTranslation(recipe as never, sourceLocale, targetLocale, config);
    },
  }),

  // ──────────────────────────────────────────────
  // AI: Ingredient curation
  // ──────────────────────────────────────────────

  /** Propose pairings for an ingredient using the slug inventory. */
  aiProposeIngredientPairings: defineAction({
    accept: "json",
    input: z.object({
      ingredient: z.record(z.string(), z.unknown()),
      locale: z.enum(["en", "de"]).default("en"),
    }),
    handler: async ({ ingredient, locale }) => {
      const config = resolveAiConfig();
      const store = await createStore();
      const items = await store.list("ingredients");
      const inventory = items
        .filter((i) => i.id.startsWith(`${locale}/`))
        .map((i) => ({
          slug: i.id.slice(3),
          name: String((i.data as Record<string, unknown>)["name"] ?? i.id.slice(3)),
        }));
      const { proposeIngredientPairings } = await import("content-ai");
      return proposeIngredientPairings(ingredient as never, inventory, config);
    },
  }),

  /** Propose values for missing ingredient fields. */
  aiProposeIngredientImprovements: defineAction({
    accept: "json",
    input: z.object({
      ingredient: z.record(z.string(), z.unknown()),
      missingFields: z.array(z.string()),
    }),
    handler: async ({ ingredient, missingFields }) => {
      const config = resolveAiConfig();
      const { proposeIngredientImprovements } = await import("content-ai");
      return proposeIngredientImprovements(ingredient as never, missingFields, config);
    },
  }),

  /** Draft a translation of ingredient text fields into targetLocale. */
  aiTranslateIngredient: defineAction({
    accept: "json",
    input: z.object({
      ingredient: z.record(z.string(), z.unknown()),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
    }),
    handler: async ({ ingredient, sourceLocale, targetLocale }) => {
      const config = resolveAiConfig();
      const { proposeIngredientTranslation } = await import("content-ai");
      return proposeIngredientTranslation(ingredient as never, sourceLocale, targetLocale, config);
    },
  }),

  /** Merge new content into an existing ingredient and return the proposed merged version. */
  aiMergeIngredient: defineAction({
    accept: "form",
    input: z.object({
      existing: z.string(), // JSON-stringified existing ingredient
      sourceKind: z.enum(["file", "text", "prompt"]),
      file: z.instanceof(File).optional(),
      mimeType: z.string().optional(),
      text: z.string().optional(),
      prompt: z.string().optional(),
    }),
    handler: async ({ existing, sourceKind, file, mimeType, text, prompt }) => {
      const config = resolveAiConfig();
      const { mergeIngredient } = await import("content-ai");
      const existingIngredient = JSON.parse(existing) as Record<string, unknown>;

      if (sourceKind === "prompt") {
        if (!prompt) throw new ActionError({ code: "BAD_REQUEST", message: "Prompt required." });
        return mergeIngredient(
          { existing: existingIngredient as never, source: { kind: "prompt", prompt } },
          config,
        );
      }
      if (sourceKind === "text") {
        if (!text) throw new ActionError({ code: "BAD_REQUEST", message: "Text required." });
        return mergeIngredient(
          { existing: existingIngredient as never, source: { kind: "text", content: text } },
          config,
        );
      }
      if (!file || !mimeType) {
        throw new ActionError({ code: "BAD_REQUEST", message: "File required." });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (mimeType === "text/plain" || mimeType === "text/markdown") {
        return mergeIngredient(
          {
            existing: existingIngredient as never,
            source: { kind: "text", content: await file.text() },
          },
          config,
        );
      }
      const kind = mimeType === "application/pdf" ? "pdf" : "image";
      const source =
        kind === "pdf" ? ({ kind, bytes } as const) : ({ kind, bytes, mimeType } as const);
      return mergeIngredient({ existing: existingIngredient as never, source }, config);
    },
  }),

  /**
   * Run AI curation for an ingredient (improvements + pairings + language detection).
   * Writes ingredientMeta; auto-applies high-confidence pairings.
   */
  aiRefreshIngredientSuggestions: defineAction({
    accept: "json",
    input: z.object({
      locale: z.enum(["en", "de"]),
      slug: z.string().min(1),
      ingredient: z.record(z.string(), z.unknown()),
      existingMeta: z.record(z.string(), z.unknown()).optional(),
      missingFields: z.array(z.string()).default([]),
    }),
    handler: async ({ locale, slug, ingredient, existingMeta = {}, missingFields }) => {
      const config = resolveAiConfig();
      const { proposeIngredientImprovements, proposeIngredientPairings, detectLanguage } =
        await import("content-ai");
      const store = await createStore();

      const { createHash } = await import("node:crypto");
      const metaForHash = { ...existingMeta } as Record<string, unknown>;
      delete metaForHash["aiSuggestions"];
      const contentHash = createHash("sha256")
        .update(JSON.stringify({ ingredient, meta: metaForHash }))
        .digest("hex")
        .slice(0, 16);

      // Skip if unchanged
      const existing = existingMeta["aiSuggestions"] as Record<string, unknown> | undefined;
      if (existing && existing["contentHash"] === contentHash) {
        return { aiSuggestions: existing, autoLinked: 0, skipped: true };
      }

      // Build inventory (exclude self)
      const items = await store.list("ingredients");
      const inventory = items
        .filter((i) => i.id.startsWith(`${locale}/`) && i.id !== `${locale}/${slug}`)
        .map((i) => ({
          slug: i.id.slice(3),
          name: String((i.data as Record<string, unknown>)["name"] ?? i.id.slice(3)),
        }));

      // Exclude image field from improvements
      const fieldsForAi = missingFields.filter((f) => f !== "image");

      const PLACEHOLDER_PATTERNS = /example\.|placeholder\.|picsum\.|via\.placeholder\./i;

      const [improvementsResult, pairingsResult, langResult] = await Promise.allSettled([
        fieldsForAi.length
          ? proposeIngredientImprovements(ingredient as never, fieldsForAi, config)
          : Promise.resolve({ fields: [] }),
        inventory.length
          ? proposeIngredientPairings(ingredient as never, inventory, config)
          : Promise.resolve([]),
        !existingMeta["locale"]
          ? detectLanguage(
              [ingredient["name"], ingredient["summary"], ingredient["description"]]
                .filter(Boolean)
                .map(String)
                .join(" — "),
              config,
            )
          : Promise.resolve(null),
      ]);

      const rawImprovements =
        improvementsResult.status === "fulfilled" ? improvementsResult.value.fields : [];
      const filteredImprovements = rawImprovements.filter(
        (f) =>
          f.field !== "image" &&
          !(typeof f.suggestion === "string" && PLACEHOLDER_PATTERNS.test(f.suggestion)),
      );

      const proposedPairings = pairingsResult.status === "fulfilled" ? pairingsResult.value : [];

      const detectedLanguage =
        langResult.status === "fulfilled" && langResult.value
          ? langResult.value.language
          : undefined;

      // Language mismatch: check if detected lang differs from current locale
      const languageMismatch = !!(detectedLanguage && detectedLanguage !== locale);

      const aiSuggestions = {
        contentHash,
        generatedAt: new Date().toISOString(),
        improvements: filteredImprovements,
        pairings: proposedPairings.map((p) => ({
          slug: p.slug,
          description: p.description,
          confidence: p.confidence as "high" | "medium" | "low",
        })),
        detectedLanguage,
        languageMismatch,
      };

      // Auto-apply: high-confidence pairings (additive, never overwrites)
      const highConf = proposedPairings.filter((p) => p.confidence === "high");
      let autoLinked = 0;
      if (highConf.length > 0) {
        const existingPairings = await store.list("pairings");
        const existingIds = new Set(existingPairings.map((p) => p.id));
        for (const pairing of highConf) {
          const id = [slug, pairing.slug].sort().join("--");
          if (!existingIds.has(id)) {
            await store.put("pairings", id, {
              ingredients: [slug, pairing.slug].sort() as [string, string],
              description: pairing.description,
            });
            autoLinked++;
          }
        }
      }

      const updatedMeta = { ...existingMeta, aiSuggestions };
      await store.put("ingredientMeta", `${locale}/${slug}`, updatedMeta);

      return { aiSuggestions, autoLinked, skipped: false };
    },
  }),

  /**
   * Translate an ingredient's text fields and save as locale-twin.
   * Returns CONFLICT if the target locale file already exists.
   */
  aiCreateIngredientTranslation: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      ingredient: z.record(z.string(), z.unknown()),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
    }),
    handler: async ({ slug, ingredient, sourceLocale, targetLocale }) => {
      const config = resolveAiConfig();
      const { proposeIngredientTranslation } = await import("content-ai");
      const store = await createStore();

      const existing = await store.get("ingredients", `${targetLocale}/${slug}`);
      if (existing) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Translation already exists at ${targetLocale}/${slug}.`,
        });
      }

      const translation = await proposeIngredientTranslation(
        ingredient as never,
        sourceLocale,
        targetLocale,
        config,
      );

      const translatedIngredient = { ...ingredient, ...translation.fields };
      await store.put("ingredients", `${targetLocale}/${slug}`, translatedIngredient);

      // Create minimal ingredient meta for the translation
      await store.put("ingredientMeta", `${targetLocale}/${slug}`, {
        kind: "ingredient",
        translationOf: `${sourceLocale}/${slug}`,
        translations: {},
      });

      // Back-link: update source meta to record the translation
      const sourceMeta = (await store.get("ingredientMeta", `${sourceLocale}/${slug}`))?.data as
        | Record<string, unknown>
        | undefined;
      const currentTranslations =
        typeof sourceMeta?.["translations"] === "object" && sourceMeta["translations"] !== null
          ? (sourceMeta["translations"] as Record<string, string>)
          : {};
      await store.put("ingredientMeta", `${sourceLocale}/${slug}`, {
        ...sourceMeta,
        translations: { ...currentTranslations, [targetLocale]: `${targetLocale}/${slug}` },
      });

      return { ok: true, slug, targetLocale };
    },
  }),

  /** Extract a Pairing from an uploaded file (PDF/image/text). */
  aiExtractPairing: defineAction({
    accept: "form",
    input: fileOrTextInput,
    handler: async (input) => {
      const config = resolveAiConfig();
      const { extractPairingFromFile } = await import("content-ai");
      const resolved = await resolveFileInput(input);
      if (resolved.kind === "pdf" || resolved.kind === "image") {
        return extractPairingFromFile(resolved, config);
      }
      return extractPairingFromFile({ kind: "text", content: resolved.content }, config);
    },
  }),

  /** Merge new content into an existing pairing description and return the proposed version. */
  aiMergePairing: defineAction({
    accept: "form",
    input: z.object({
      existing: z.string(),
      locale: z.string().length(2).default("en"),
      sourceKind: z.enum(["file", "text", "prompt"]),
      file: z.instanceof(File).optional(),
      mimeType: z.string().optional(),
      text: z.string().optional(),
      prompt: z.string().optional(),
    }),
    handler: async ({ existing, locale, sourceKind, file, mimeType, text, prompt }) => {
      const config = resolveAiConfig();
      const { mergePairing } = await import("content-ai");
      const existingData = JSON.parse(existing) as Record<string, unknown>;

      if (sourceKind === "prompt") {
        if (!prompt) throw new ActionError({ code: "BAD_REQUEST", message: "Prompt required." });
        return mergePairing(
          { existing: { ...existingData, locale } as never, source: { kind: "prompt", prompt } },
          config,
        );
      }
      if (sourceKind === "text") {
        if (!text) throw new ActionError({ code: "BAD_REQUEST", message: "Text required." });
        return mergePairing(
          {
            existing: { ...existingData, locale } as never,
            source: { kind: "text", content: text },
          },
          config,
        );
      }
      if (!file || !mimeType)
        throw new ActionError({ code: "BAD_REQUEST", message: "File required." });
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (mimeType === "text/plain" || mimeType === "text/markdown") {
        return mergePairing(
          {
            existing: { ...existingData, locale } as never,
            source: { kind: "text", content: await file.text() },
          },
          config,
        );
      }
      const kind = mimeType === "application/pdf" ? "pdf" : "image";
      const source =
        kind === "pdf" ? ({ kind, bytes } as const) : ({ kind, bytes, mimeType } as const);
      return mergePairing({ existing: { ...existingData, locale } as never, source }, config);
    },
  }),

  /** Translate a pairing description into targetLocale and save it in the descriptions map. */
  aiTranslatePairing: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
    }),
    handler: async ({ id, sourceLocale, targetLocale }) => {
      const config = resolveAiConfig();
      const { proposePairingTranslation } = await import("content-ai");
      const store = await createStore();

      const existing = await store.get("pairings", id);
      if (!existing)
        throw new ActionError({ code: "NOT_FOUND", message: `Pairing ${id} not found.` });

      const d = existing.data as Record<string, unknown>;
      const descriptions =
        (d["descriptions"] as Record<string, string>) ??
        (d["description"] ? { en: String(d["description"]) } : {});

      if (descriptions[targetLocale]) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Translation for ${targetLocale} already exists.`,
        });
      }

      const sourceDescription =
        descriptions[sourceLocale] ?? descriptions["en"] ?? Object.values(descriptions)[0] ?? "";
      const ings = d["ingredients"] as [string, string];

      const result = await proposePairingTranslation(
        { ingredient1: ings[0], ingredient2: ings[1], description: sourceDescription },
        sourceLocale,
        targetLocale,
        config,
      );

      const updatedDescriptions = {
        ...descriptions,
        [targetLocale]: result.fields["description"] ?? sourceDescription,
      };
      await store.put("pairings", id, { ingredients: ings, descriptions: updatedDescriptions });
      return { ok: true, description: updatedDescriptions[targetLocale] };
    },
  }),

  /** Refresh AI improvement suggestions for a pairing description in a given locale. */
  aiRefreshPairingSuggestions: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      locale: z.string().length(2).default("en"),
      pairing: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ id, locale, pairing }) => {
      const config = resolveAiConfig();
      const { proposePairingImprovements } = await import("content-ai");
      const store = await createStore();

      const { createHash } = await import("node:crypto");
      const contentHash = createHash("sha256")
        .update(JSON.stringify({ pairing, locale }))
        .digest("hex")
        .slice(0, 16);

      const existingMeta = (await store.get("pairingMeta", id))?.data as
        | Record<string, unknown>
        | undefined;
      const existingAi = (existingMeta?.["aiSuggestions"] as Record<string, unknown> | undefined)?.[
        locale
      ] as Record<string, unknown> | undefined;
      if (existingAi && existingAi["contentHash"] === contentHash) {
        return { aiSuggestions: existingMeta?.["aiSuggestions"], skipped: true };
      }

      const descriptions = (pairing["descriptions"] as Record<string, string>) ?? {};
      const description =
        descriptions[locale] ?? descriptions["en"] ?? String(pairing["description"] ?? "");
      const ings = pairing["ingredients"] as [string, string];

      const improvements = await proposePairingImprovements(
        { ingredient1: ings?.[0] ?? "", ingredient2: ings?.[1] ?? "", description },
        locale,
        config,
      );

      const aiBlock = {
        contentHash,
        generatedAt: new Date().toISOString(),
        improvements: improvements.fields,
      };
      const updatedAi = {
        ...((existingMeta?.["aiSuggestions"] as Record<string, unknown>) ?? {}),
        [locale]: aiBlock,
      };
      await store.put("pairingMeta", id, { ...existingMeta, aiSuggestions: updatedAi });

      return { aiSuggestions: updatedAi, skipped: false };
    },
  }),

  /** Check whether a slug is available in a given collection. */
  checkSlugAvailable: defineAction({
    accept: "json",
    input: z.object({
      collection: z.enum(["recipes", "spicemixes", "sauces", "ingredients"]),
      slug: z.string().min(1),
    }),
    handler: async ({ collection, slug }) => {
      const store = await createStore();
      type C = Parameters<typeof store.get>[0];
      const existing = await store.get(collection as C, slug);
      return { available: !existing };
    },
  }),

  /** Search CC-licensed images via Openverse. */
  searchImages: defineAction({
    accept: "json",
    input: z.object({
      query: z.string().min(1),
      page: z.number().int().min(1).default(1),
      licenseType: z.enum(["commercial", "modification", "commercial,modification"]).optional(),
    }),
    handler: async ({ query, page, licenseType }) => {
      const { searchImages } = await import("content-ai");
      return searchImages(query, { page, licenseType });
    },
  }),

  /** Merge-patch an ingredient's meta sidecar (e.g. to store imageAttribution). */
  saveIngredientMeta: defineAction({
    accept: "json",
    input: z.object({
      locale: z.enum(["en", "de"]),
      slug: z.string().min(1),
      patch: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ locale, slug, patch }) => {
      const store = await createStore();
      const key = `${locale}/${slug}`;
      const existing = await store.get("ingredientMeta", key);
      await store.put("ingredientMeta", key, {
        ...((existing?.data as Record<string, unknown>) ?? {}),
        ...patch,
      });
      return { ok: true };
    },
  }),

  /** Merge-patch a pairing's meta sidecar (e.g. to store imageAttribution). */
  savePairingMeta: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      patch: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ id, patch }) => {
      const store = await createStore();
      const existing = await store.get("pairingMeta", id);
      await store.put("pairingMeta", id, {
        ...((existing?.data as Record<string, unknown>) ?? {}),
        ...patch,
      });
      return { ok: true };
    },
  }),

  /** Suggest a URL-safe slug derived from a recipe name via AI, with duplicate avoidance. */
  aiSuggestSlug: defineAction({
    accept: "json",
    input: z.object({
      name: z.string().min(1),
      locale: z.string().length(2).default("en"),
      collection: recipeCollectionEnum,
    }),
    handler: async ({ name, locale, collection }) => {
      const config = resolveAiConfig();
      const { proposeSlug } = await import("content-ai");
      const store = await createStore();

      const proposal = await proposeSlug(name, locale, config);
      let slug = proposal.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const existing = await store.get(collection, slug);
      if (existing) {
        let i = 2;
        while (await store.get(collection, `${slug}-${i}`)) i++;
        slug = `${slug}-${i}`;
      }
      return { slug };
    },
  }),

  /**
   * Run all AI curation passes for a recipe (improvements, tags, ingredient links, relations,
   * language detection) and persist the result in meta.aiSuggestions. Auto-applies
   * high-confidence ingredient links and detected language (when unset).
   */
  aiRefreshSuggestions: defineAction({
    accept: "json",
    input: z.object({
      collection: recipeCollectionEnum,
      slug: z.string().min(1),
      recipe: z.record(z.string(), z.unknown()),
      meta: z.record(z.string(), z.unknown()),
      missingFields: z.array(z.string()).default([]),
      locale: z.enum(["en", "de"]).default("en"),
    }),
    handler: async ({ collection, slug, recipe, meta, missingFields, locale }) => {
      const config = resolveAiConfig();
      const {
        proposeRecipeImprovements,
        proposeTags,
        proposeIngredientLinks,
        proposeRelations,
        detectLanguage,
      } = await import("content-ai");
      const store = await createStore();

      const { createHash } = await import("node:crypto");
      const metaForHash = { ...meta } as Record<string, unknown>;
      delete metaForHash["aiSuggestions"];
      const contentHash = createHash("sha256")
        .update(JSON.stringify({ recipe, meta: metaForHash }))
        .digest("hex")
        .slice(0, 16);

      // Skip regen if content hasn't changed
      const existing = (meta["aiSuggestions"] as Record<string, unknown> | undefined) ?? null;
      if (existing && existing["contentHash"] === contentHash) {
        return {
          aiSuggestions: existing,
          autoLinked: 0,
          skipped: true,
        };
      }

      // Build inventories
      const ingredientItems = await store.list("ingredients");
      const inventory = ingredientItems
        .filter((i) => i.id.startsWith(`${locale}/`))
        .map((i) => ({
          slug: i.id.slice(3),
          name: String((i.data as Record<string, unknown>)["name"] ?? i.id.slice(3)),
        }));

      const [recipes, spicemixes, sauces] = await Promise.all([
        store.list("recipes"),
        store.list("spicemixes"),
        store.list("sauces"),
      ]);
      const existingRecipes = [
        ...recipes.map((r) => ({
          collection: "recipes" as const,
          slug: r.id,
          name: String((r.data as Record<string, unknown>).name ?? r.id),
          recipeIngredient: (r.data as Record<string, unknown>).recipeIngredient as
            | string[]
            | undefined,
        })),
        ...spicemixes.map((r) => ({
          collection: "spicemixes" as const,
          slug: r.id,
          name: String((r.data as Record<string, unknown>).name ?? r.id),
        })),
        ...sauces.map((r) => ({
          collection: "sauces" as const,
          slug: r.id,
          name: String((r.data as Record<string, unknown>).name ?? r.id),
        })),
      ].filter((r) => r.slug !== slug);

      const recipeIngredients = Array.isArray(recipe["recipeIngredient"])
        ? (recipe["recipeIngredient"] as string[])
        : [];

      // Exclude "image" — AI cannot supply real image URLs, only placeholder guesses
      const fieldsForAi = missingFields.filter((f) => f !== "image");

      const [improvementsResult, tagsResult, linksResult, relationsResult, langResult] =
        await Promise.allSettled([
          fieldsForAi.length
            ? proposeRecipeImprovements(recipe as never, fieldsForAi, config)
            : Promise.resolve({ fields: [] }),
          proposeTags(recipe as never, [], config),
          recipeIngredients.length
            ? proposeIngredientLinks(recipeIngredients, inventory, config)
            : Promise.resolve([]),
          proposeRelations(recipe as never, existingRecipes, config),
          !meta["language"]
            ? detectLanguage(
                [recipe["name"], recipe["description"]].filter(Boolean).map(String).join(" — "),
                config,
              )
            : Promise.resolve(null),
        ]);

      const PLACEHOLDER_PATTERNS =
        /example\.|placeholder\.|picsum\.|via\.placeholder\.|lorempixel\.|dummyimage\./i;
      const rawImprovements =
        improvementsResult.status === "fulfilled" ? improvementsResult.value.fields : [];
      const filteredImprovements = rawImprovements.filter(
        (f) =>
          f.field !== "image" &&
          !(typeof f.suggestion === "string" && PLACEHOLDER_PATTERNS.test(f.suggestion)),
      );

      const aiSuggestions = {
        contentHash,
        generatedAt: new Date().toISOString(),
        improvements: filteredImprovements,
        tags: tagsResult.status === "fulfilled" ? tagsResult.value.tags : [],
        ingredientLinks: linksResult.status === "fulfilled" ? linksResult.value : [],
        relations: relationsResult.status === "fulfilled" ? relationsResult.value : [],
        detectedLanguage:
          langResult.status === "fulfilled" && langResult.value
            ? langResult.value.language
            : undefined,
      };

      // Auto-apply: high-confidence ingredient links (additive only)
      const existingLinks = Array.isArray(meta["ingredientLinks"])
        ? (meta["ingredientLinks"] as Array<Record<string, unknown>>)
        : [];
      const existingPatterns = new Set(existingLinks.map((l) => String(l["pattern"] ?? "")));
      const highConf = aiSuggestions.ingredientLinks.filter(
        (l) => l.confidence === "high" && !existingPatterns.has(l.pattern),
      );

      const updatedMeta: Record<string, unknown> = {
        ...meta,
        aiSuggestions,
      };

      if (highConf.length > 0) {
        updatedMeta["ingredientLinks"] = [
          ...existingLinks,
          ...highConf.map((l) => ({ pattern: l.pattern, slug: l.slug, kind: "ingredient" })),
        ];
      }

      // Auto-apply: detected language when none is set
      if (!meta["language"] && aiSuggestions.detectedLanguage) {
        updatedMeta["language"] = aiSuggestions.detectedLanguage;
        updatedMeta["locale"] = aiSuggestions.detectedLanguage;
      }

      await store.put("meta", `${collection}/${slug}`, updatedMeta);

      return {
        aiSuggestions,
        autoLinked: highConf.length,
        detectedLanguage: aiSuggestions.detectedLanguage,
        skipped: false,
      };
    },
  }),

  /**
   * Translate a recipe into a target locale and save it as a new linked document.
   * Also updates the original's meta.translations map.
   */
  aiCreateTranslation: defineAction({
    accept: "json",
    input: z.object({
      collection: recipeCollectionEnum,
      slug: z.string().min(1),
      recipe: z.record(z.string(), z.unknown()),
      meta: z.record(z.string(), z.unknown()),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
      translationSlug: z.string().min(1),
    }),
    handler: async ({
      collection,
      slug,
      recipe,
      meta,
      sourceLocale,
      targetLocale,
      translationSlug,
    }) => {
      const config = resolveAiConfig();
      const { proposeRecipeTranslation } = await import("content-ai");
      const store = await createStore();

      const existing = await store.get(collection, translationSlug);
      if (existing) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Slug "${translationSlug}" is already taken.`,
        });
      }

      const translation = await proposeRecipeTranslation(
        recipe as never,
        sourceLocale,
        targetLocale,
        config,
      );

      const translatedRecipe = { ...recipe, ...translation.fields };

      await store.put(collection, translationSlug, translatedRecipe);

      // Strip aiSuggestions from translation meta
      const translationMeta: Record<string, unknown> = {
        ...meta,
        draft: true,
        language: targetLocale,
        locale: targetLocale,
        translationOf: slug,
        aiSuggestions: undefined,
        translations: {},
        variants: [],
      };
      delete translationMeta["aiSuggestions"];
      await store.put("meta", `${collection}/${translationSlug}`, translationMeta);

      // Back-link original → translation
      const currentTranslations =
        typeof meta["translations"] === "object" && meta["translations"] !== null
          ? (meta["translations"] as Record<string, string>)
          : {};
      await store.put("meta", `${collection}/${slug}`, {
        ...meta,
        translations: { ...currentTranslations, [targetLocale]: translationSlug },
      });

      return { ok: true, translationSlug };
    },
  }),

  /** Create a minimal recipe stub (name only) for inline "create new" flow. */
  quickCreateRecipe: defineAction({
    accept: "json",
    input: z.object({
      collection: recipeCollectionEnum,
      slug: z.string().min(1),
      name: z.string().min(1),
    }),
    handler: async ({ collection, slug, name }) => {
      const store = await createStore();
      await store.put(collection, slug, {
        "@context": "https://schema.org",
        "@type": "Recipe",
        name,
        recipeIngredient: [""],
        recipeInstructions: [{ "@type": "HowToStep", text: "" }],
      });
      await store.put("meta", `${collection}/${slug}`, {
        draft: true,
        kind:
          collection === "recipes" ? "recipe" : collection === "spicemixes" ? "spicemix" : "sauce",
        tags: [],
        ingredientLinks: [],
        externalSources: [],
        goesWellWith: [],
        usesBase: [],
        variants: [],
      });
      return { ok: true, slug };
    },
  }),
};
