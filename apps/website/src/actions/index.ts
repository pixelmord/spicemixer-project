import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { createStore } from "@/lib/content-store.ts";
import { createMetaSidecar, INGREDIENT_META, PAIRING_META } from "@/lib/meta-sidecar.ts";
import { slugFromLocaleId } from "@/lib/recipe-augment.ts";
import { entityRefSchema } from "@/lib/entity-ref.ts";
import type { EntityRef } from "@/lib/entity-ref.ts";
import { fetchRecipe } from "recipe-ingestion";
import { scoreRecipe, scoreIngredient, scorePairing } from "@/lib/completeness.ts";
import {
  deleteRecipe as libDeleteRecipe,
  publishRecipe as libPublishRecipe,
  unpublishRecipe as libUnpublishRecipe,
} from "@/lib/recipes.ts";
import {
  quickCreateIngredient as libQuickCreateIngredient,
  saveIngredientMeta as libSaveIngredientMeta,
  deleteIngredient as libDeleteIngredient,
  publishIngredient as libPublishIngredient,
  unpublishIngredient as libUnpublishIngredient,
} from "@/lib/ingredients.ts";
import {
  buildPairingData as libBuildPairingData,
  togglePairingDraft as libTogglePairingDraft,
  deletePairing as libDeletePairing,
  savePairingMeta as libSavePairingMeta,
} from "@/lib/pairings.ts";
import { saveEntity as libSaveEntity } from "@/lib/save-entity.ts";
import { NotFoundError } from "@/lib/errors.ts";
import { AiError, withOrigin, type AiEvent } from "content-ai";
import { createSourceStore } from "@/lib/stores/source-store.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const fileOrTextInput = z.object({
  file: z.instanceof(File).optional(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
  /** When set to "1", the action returns model telemetry alongside the result. */
  debug: z.string().optional(),
});

function isDebug(flag?: string): boolean {
  return flag === "1" || flag === "true";
}

/**
 * Convert any error from a content-ai call into an ActionError that carries
 * the diagnostic payload so the client can render it in debug panels.
 */
function aiErrorToActionError(e: unknown, fallbackMessage: string): ActionError {
  if (e instanceof AiError) {
    const detailsPayload = e.details ? JSON.stringify(e.details) : "";
    // ActionError.message is what reaches the client; serialize details into it
    // so the client UI can parse and display them.
    const message = detailsPayload ? `${e.message}\n__AI_DETAILS__${detailsPayload}` : e.message;
    return new ActionError({ code: "INTERNAL_SERVER_ERROR", message });
  }
  if (e instanceof ActionError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: `${fallbackMessage}: ${message}`,
  });
}

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

async function resolveMergeSource({
  sourceKind,
  file,
  mimeType,
  text,
  prompt,
}: {
  sourceKind: "file" | "text" | "prompt";
  file?: File;
  mimeType?: string;
  text?: string;
  prompt?: string;
}) {
  if (sourceKind === "prompt") {
    if (!prompt) throw new ActionError({ code: "BAD_REQUEST", message: "Prompt required." });
    return { kind: "prompt" as const, prompt };
  }
  if (sourceKind === "text") {
    if (!text) throw new ActionError({ code: "BAD_REQUEST", message: "Text required." });
    return { kind: "text" as const, content: text };
  }
  if (!file || !mimeType) {
    throw new ActionError({ code: "BAD_REQUEST", message: "File required." });
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ActionError({ code: "BAD_REQUEST", message: "File exceeds 10 MB limit." });
  }
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return { kind: "text" as const, content: await file.text() };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mimeType === "application/pdf") return { kind: "pdf" as const, bytes };
  return { kind: "image" as const, bytes, mimeType };
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

function mimeForFileInput(input: ContentAiFileInput): string {
  switch (input.kind) {
    case "text":
      return "text/plain";
    case "pdf":
      return "application/pdf";
    case "image":
      return input.mimeType;
  }
}

function bytesForFileInput(input: ContentAiFileInput): Uint8Array {
  return input.kind === "text" ? new TextEncoder().encode(input.content) : input.bytes;
}

async function persistSourceArtifacts(
  input: ContentAiFileInput,
  filename?: string,
): Promise<{
  sourceStore: ReturnType<typeof createSourceStore>;
  binaryHash: string;
  extractionInput: ContentAiFileInput;
  now: string;
}> {
  const sourceStore = createSourceStore();
  const now = new Date().toISOString();
  const rawBytes = bytesForFileInput(input);
  const { binaryHash } = await sourceStore.putBinary(rawBytes, {
    kind: input.kind,
    mime: mimeForFileInput(input),
    sizeBytes: rawBytes.length,
    filename,
    uploadedAt: now,
  });

  let extractionInput: ContentAiFileInput = input;
  if (input.kind === "text") {
    await sourceStore.putText(binaryHash, "direct", "1", input.content, {
      charCount: input.content.length,
      extractedAt: now,
      parentBinaryHash: binaryHash,
    });
  } else if (input.kind === "pdf") {
    const { extractPdfContent } = await import("content-ai");
    const pdfContent = await extractPdfContent(input.bytes);
    if (pdfContent.kind === "text") {
      await sourceStore.putText(binaryHash, "pdfjs", "5", pdfContent.text, {
        charCount: pdfContent.text.length,
        pageCount: pdfContent.pageCount,
        extractedAt: now,
        parentBinaryHash: binaryHash,
      });
      extractionInput = { kind: "text", content: pdfContent.text };
    }
  }

  return { sourceStore, binaryHash, extractionInput, now };
}

const recipeCollectionEnum = z.enum(["recipes", "mixtures"]);

// ──────────────────────────────────────────────
// Helper: build the combined listing used by the content table
// ──────────────────────────────────────────────

async function buildListing() {
  const store = await createStore();
  const [recipes, mixtures, metas, ingredients, ingredientMetas, pairings, pairingMetas] =
    await Promise.all([
      store.list("recipes"),
      store.list("mixtures"),
      store.list("meta"),
      store.list("ingredients"),
      store.list(INGREDIENT_META),
      store.list("pairings"),
      store.list(PAIRING_META),
    ]);

  const metaMap = new Map(metas.map((m) => [m.id, m.data as Record<string, unknown>]));
  const ingredientMetaMap = new Map(
    ingredientMetas.map((m) => [m.id, m.data as Record<string, unknown>]),
  );
  const pairingMetaMap = new Map(
    pairingMetas.map((m) => [m.id, m.data as Record<string, unknown>]),
  );

  const recipeItems = [...recipes, ...mixtures].map((item) => {
    const collection = item.collection as "recipes" | "mixtures";
    // item.id is "locale/slug" per ADR 0009; meta key is "kind/locale/slug"
    const metaId = `${collection}/${item.id}`;
    const meta = metaMap.get(metaId) ?? {};
    const completeness = scoreRecipe(item.data as Record<string, unknown>, meta);
    const slug = slugFromLocaleId(item.id);
    return {
      type: "recipe" as const,
      collection,
      id: slug,
      name: (item.data as Record<string, unknown>).name ?? slug,
      draft: !!(meta as Record<string, unknown>).draft,
      completeness,
      updatedAt: item.updatedAt,
    };
  });

  const ingredientItems = ingredients.map((item) => {
    const completeness = scoreIngredient(item.data as Record<string, unknown>);
    const meta = ingredientMetaMap.get(item.id) ?? {};
    return {
      type: "ingredient" as const,
      collection: "ingredients" as const,
      id: item.id,
      name: (item.data as Record<string, unknown>).name ?? item.id,
      draft: !!(meta as Record<string, unknown>).draft,
      completeness,
      updatedAt: item.updatedAt,
    };
  });

  const pairingItems = pairings.map((item) => {
    const d = item.data as Record<string, unknown>;
    const ings = (d["ingredients"] as Array<EntityRef | string>) ?? [];
    const descriptions = (d["descriptions"] as Record<string, string>) ?? {};
    const completeness = scorePairing(d, "en");
    const translations = ["en", "de"].filter((l) => !!descriptions[l]);
    const description =
      descriptions["en"] ?? (typeof d["description"] === "string" ? d["description"] : "");
    const refSlug = (v: EntityRef | string | undefined): string => {
      if (v == null) return "?";
      if (typeof v === "string") return v;
      return v.slug;
    };
    const pairingMeta = pairingMetaMap.get(item.id) ?? {};
    return {
      type: "pairing" as const,
      collection: "pairings" as const,
      id: item.id,
      name: `${refSlug(ings[0])} ↔ ${refSlug(ings[1])}`,
      draft: !!(pairingMeta["draft"] as boolean),
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
      collection: z.enum(["recipes", "mixtures", "ingredients", "meta"]),
      id: z.string(),
    }),
    handler: async ({ collection, id }) => {
      const store = await createStore();
      const item = await store.get(collection, id);
      if (!item) return null;
      // For recipe collections also fetch the meta sidecar
      if (collection === "recipes" || collection === "mixtures") {
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
      locale: z.enum(["en", "de"]),
      recipe: z.record(z.string(), z.unknown()),
      meta: z.record(z.string(), z.unknown()).optional(),
      aiMergeModel: z.string().optional(),
      traceId: z.string().optional(),
    }),
    handler: async ({ collection, slug, locale, recipe, meta, aiMergeModel, traceId }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      let finalMeta = meta;
      if (aiMergeModel) {
        const { recordAiEvent, hashSuggestion } = await import("content-ai");
        const existingRecord = await sidecar.read({ collection, locale, slug });
        const existingMeta = (existingRecord?.data as Record<string, unknown>) ?? {};
        const base = meta ?? existingMeta;
        const existingEvents: AiEvent[] = Array.isArray(base["aiEvents"])
          ? (base["aiEvents"] as AiEvent[])
          : [];
        const updatedEvents = recordAiEvent(existingEvents, {
          type: "accepted",
          suggestion: {
            hash: hashSuggestion(recipe),
            summary: "AI-merged recipe accepted",
          },
          model: aiMergeModel,
          traceId,
        });
        finalMeta = { ...base, aiEvents: updatedEvents };
      }
      await libSaveEntity(store, sidecar, {
        ref: { collection, locale, slug },
        content: recipe,
        meta: finalMeta,
      });
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
      meta: z.record(z.string(), z.unknown()).optional(),
      aiMergeModel: z.string().optional(),
      traceId: z.string().optional(),
    }),
    handler: async ({ locale, slug, ingredient, meta, aiMergeModel, traceId }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      let finalMeta = meta;
      if (aiMergeModel) {
        const { recordAiEvent, hashSuggestion } = await import("content-ai");
        const existingRecord = await sidecar.read({ collection: "ingredients", locale, slug });
        const existingMeta = (existingRecord?.data as Record<string, unknown>) ?? {};
        const base = meta ?? existingMeta;
        const existingEvents: AiEvent[] = Array.isArray(base["aiEvents"])
          ? (base["aiEvents"] as AiEvent[])
          : [];
        const updatedEvents = recordAiEvent(existingEvents, {
          type: "accepted",
          suggestion: {
            hash: hashSuggestion(ingredient),
            summary: "AI-merged ingredient accepted",
          },
          model: aiMergeModel,
          traceId,
        });
        finalMeta = { ...base, aiEvents: updatedEvents };
      }
      await libSaveEntity(store, sidecar, {
        ref: { collection: "ingredients", locale, slug },
        content: ingredient,
        meta: finalMeta,
      });
      return { ok: true, slug };
    },
  }),

  /** Upsert a pairing entity. id = slug-a--slug-b (alphabetical). */
  savePairing: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      ingredients: z.tuple([entityRefSchema, entityRefSchema]),
      description: z.string().min(1),
      locale: z.string().length(2).default("en"),
      draft: z.boolean().optional(),
      image: z.string().optional(),
      imageAttribution: z.record(z.string(), z.unknown()).optional(),
      aiMergeModel: z.string().optional(),
      traceId: z.string().optional(),
    }),
    handler: async ({
      id,
      ingredients,
      description,
      locale,
      draft,
      image,
      imageAttribution,
      aiMergeModel,
      traceId,
    }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      const pairingData = await libBuildPairingData(store, {
        id,
        ingredients,
        description,
        locale,
        image,
        imageAttribution,
      });
      await libSaveEntity(store, sidecar, {
        ref: { collection: "pairings", slug: id },
        content: pairingData,
        meta: draft !== undefined ? { draft } : undefined,
      });
      if (aiMergeModel) {
        const { recordAiEvent, hashSuggestion } = await import("content-ai");
        const pairingRef = { collection: "pairings" as const, slug: id };
        const existingMetaRecord = await sidecar.read(pairingRef);
        const existingMeta = (existingMetaRecord?.data as Record<string, unknown>) ?? {};
        const existingEvents: AiEvent[] = Array.isArray(existingMeta["aiEvents"])
          ? (existingMeta["aiEvents"] as AiEvent[])
          : [];
        const updatedEvents = recordAiEvent(existingEvents, {
          type: "accepted",
          field: "description",
          suggestion: {
            hash: hashSuggestion({ description, locale }),
            summary: `AI-enhanced pairing description (${locale}) accepted`,
          },
          model: aiMergeModel,
          traceId,
        });
        await sidecar.write(pairingRef, { ...existingMeta, aiEvents: updatedEvents });
      }
      return { ok: true, id };
    },
  }),

  /** Toggle draft/published state for a pairing. */
  togglePairingDraft: defineAction({
    accept: "json",
    input: z.object({ id: z.string().min(1), draft: z.boolean() }),
    handler: async ({ id, draft }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      try {
        await libTogglePairingDraft(store, sidecar, { id, draft });
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new ActionError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
      return { ok: true };
    },
  }),

  /** Delete a pairing entity by id. */
  deletePairing: defineAction({
    accept: "json",
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libDeletePairing(store, sidecar, { id });
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
          ingredients: d["ingredients"] as [EntityRef, EntityRef],
          descriptions:
            (d["descriptions"] as Record<string, string>) ??
            (typeof d["description"] === "string" ? { en: d["description"] } : {}),
          updatedAt: item.updatedAt,
        };
      });
    },
  }),

  /** List all pairing entities that include a given entity ref (matched by collection+slug). */
  listPairingsFor: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      collection: z.enum(["ingredients", "mixtures"]).optional(),
    }),
    handler: async ({ slug, collection }) => {
      const store = await createStore();
      const all = await store.list("pairings");
      return all
        .filter((item) => {
          const d = item.data as Record<string, unknown>;
          const ings = d["ingredients"];
          if (!Array.isArray(ings)) return false;
          return ings.some((ref: unknown) => {
            if (typeof ref === "object" && ref !== null && "slug" in ref) {
              const r = ref as EntityRef;
              return r.slug === slug && (!collection || r.collection === collection);
            }
            return ref === slug;
          });
        })
        .map((item) => {
          const d = item.data as Record<string, unknown>;
          const descriptions =
            (d["descriptions"] as Record<string, string>) ??
            (typeof d["description"] === "string" ? { en: d["description"] } : {});
          return {
            id: item.id,
            ingredients: d["ingredients"] as [EntityRef, EntityRef],
            descriptions,
          };
        });
    },
  }),

  /** Delete a content item (and its meta sidecar if it's a recipe collection). */
  deleteItem: defineAction({
    input: z.object({
      collection: z.enum(["recipes", "mixtures", "ingredients"]),
      id: z.string(),
    }),
    handler: async ({ collection, id }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      if (collection === "ingredients") {
        await libDeleteIngredient(store, sidecar, { id });
      } else {
        // id may be "locale/slug" (new format) or bare "slug" (legacy admin, assume "en")
        const slash = id.indexOf("/");
        const locale = slash !== -1 ? id.slice(0, slash) : "en";
        const slug = slash !== -1 ? id.slice(slash + 1) : id;
        await libDeleteRecipe(store, sidecar, { collection, locale, slug });
      }
      return { ok: true };
    },
  }),

  /** Set meta.draft = false (publish). */
  publish: defineAction({
    input: z.object({
      collection: recipeCollectionEnum,
      locale: z.enum(["en", "de"]),
      slug: z.string().min(1),
    }),
    handler: async ({ collection, locale, slug }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libPublishRecipe(sidecar, { collection, locale, slug });
      return { ok: true };
    },
  }),

  /** Set meta.draft = true (unpublish). */
  unpublish: defineAction({
    input: z.object({
      collection: recipeCollectionEnum,
      locale: z.enum(["en", "de"]),
      slug: z.string().min(1),
    }),
    handler: async ({ collection, locale, slug }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libUnpublishRecipe(sidecar, { collection, locale, slug });
      return { ok: true };
    },
  }),

  /** Set ingredient meta draft = false (publish). */
  publishIngredient: defineAction({
    input: z.object({ locale: z.enum(["en", "de"]), slug: z.string().min(1) }),
    handler: async ({ locale, slug }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libPublishIngredient(sidecar, { locale, slug });
      return { ok: true };
    },
  }),

  /** Set ingredient meta draft = true (unpublish). */
  unpublishIngredient: defineAction({
    input: z.object({ locale: z.enum(["en", "de"]), slug: z.string().min(1) }),
    handler: async ({ locale, slug }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libUnpublishIngredient(sidecar, { locale, slug });
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
        .map((item) => {
          const d = item.data as Record<string, unknown>;
          return {
            slug: item.id.slice(3),
            name: typeof d.name === "string" ? d.name : item.id.slice(3),
          };
        });
    },
  }),

  /** Return a flat list of recipe/mixture slugs + names for use in combobox fields. */
  listRecipeOptions: defineAction({
    handler: async () => {
      const store = await createStore();
      const [recipes, mixtures] = await Promise.all([
        store.list("recipes"),
        store.list("mixtures"),
      ]);
      return [
        ...recipes.map((item) => {
          const d = item.data as Record<string, unknown>;
          return {
            collection: "recipes" as const,
            slug: slugFromLocaleId(item.id),
            name: typeof d.name === "string" ? d.name : slugFromLocaleId(item.id),
          };
        }),
        ...mixtures.map((item) => {
          const d = item.data as Record<string, unknown>;
          return {
            collection: "mixtures" as const,
            slug: slugFromLocaleId(item.id),
            name: typeof d.name === "string" ? d.name : slugFromLocaleId(item.id),
          };
        }),
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
      const sidecar = createMetaSidecar(store);
      const result = await libQuickCreateIngredient(store, sidecar, {
        locale,
        slug,
        name,
        category,
      });
      return { ok: true, slug: result.slug };
    },
  }),

  // ──────────────────────────────────────────────
  // AI: File ingestion
  // ──────────────────────────────────────────────

  /** Extract a Recipe from an uploaded file (PDF/image/text) or pasted text. */
  aiExtractRecipe: defineAction({
    accept: "form",
    input: fileOrTextInput,
    handler: withOrigin({
      surface: "admin",
      action: "aiExtractRecipe",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async (input) => {
      const config = resolveAiConfig();
      const { extractRecipeFromFile } = await import("content-ai");
      const debug = isDebug(input.debug);
      const resolved = await resolveFileInput(input);
      const { sourceStore, binaryHash, extractionInput, now } = await persistSourceArtifacts(
        resolved,
        input.file?.name,
      );

      try {
        const result = await extractRecipeFromFile(extractionInput, config, { debug });
        const traceId = crypto.randomUUID();
        await sourceStore.putStructured(binaryHash, traceId, result.recipe, {
          capability: "aiExtractRecipe",
          model: config.model,
          at: now,
          parentBinaryHash: binaryHash,
        });
        const base = debug ? { ...result, model: config.model } : result;
        return { ...base, traceId, binaryHash };
      } catch (e) {
        throw aiErrorToActionError(e, "Recipe extraction failed");
      }
    }),
  }),

  /** Extract an Ingredient from an uploaded file (PDF/image/text) or pasted text. */
  aiExtractIngredient: defineAction({
    accept: "form",
    input: fileOrTextInput,
    handler: withOrigin({
      surface: "admin",
      action: "aiExtractIngredient",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async (input) => {
      const config = resolveAiConfig();
      const { extractIngredientFromFile } = await import("content-ai");
      const debug = isDebug(input.debug);
      const resolved = await resolveFileInput(input);
      const { sourceStore, binaryHash, extractionInput, now } = await persistSourceArtifacts(
        resolved,
        input.file?.name,
      );

      try {
        const result = await extractIngredientFromFile(extractionInput, config, { debug });
        const traceId = crypto.randomUUID();
        await sourceStore.putStructured(binaryHash, traceId, result.ingredient, {
          capability: "aiExtractIngredient",
          model: config.model,
          at: now,
          parentBinaryHash: binaryHash,
        });
        const base = debug ? { ...result, model: config.model } : result;
        return { ...base, traceId, binaryHash };
      } catch (e) {
        throw aiErrorToActionError(e, "Ingredient extraction failed");
      }
    }),
  }),

  /** Generate a new Recipe from a prompt. */
  aiGenerateRecipe: defineAction({
    accept: "json",
    input: z.object({
      prompt: z.string().min(3),
      locale: z.enum(["en", "de"]).default("en"),
      style: z.enum(["recipe", "mixture"]).default("recipe"),
      debug: z.boolean().optional(),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiGenerateRecipe",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ prompt, locale, style, debug }) => {
      const config = resolveAiConfig();
      const { generateRecipeFromPrompt } = await import("content-ai");
      try {
        const result = await generateRecipeFromPrompt({ prompt, locale, style }, config, {
          debug: debug === true,
        });
        return debug ? { ...result, model: config.model } : result;
      } catch (e) {
        throw aiErrorToActionError(e, "Recipe generation failed");
      }
    }),
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
      debug: z.string().optional(),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiMergeRecipe",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ existing, sourceKind, file, mimeType, text, prompt, debug }) => {
      const config = resolveAiConfig();
      const { mergeRecipe } = await import("content-ai");
      const existingRecipe = JSON.parse(existing) as Record<string, unknown>;
      const source = await resolveMergeSource({ sourceKind, file, mimeType, text, prompt });

      let artifacts: Awaited<ReturnType<typeof persistSourceArtifacts>> | undefined;
      if (source.kind !== "prompt") {
        artifacts = await persistSourceArtifacts(source, file?.name);
      }

      try {
        const result = await mergeRecipe({ existing: existingRecipe as never, source }, config, {
          debug: isDebug(debug),
        });
        let traceId: string | undefined;
        let binaryHash: string | undefined;
        if (artifacts) {
          traceId = crypto.randomUUID();
          binaryHash = artifacts.binaryHash;
          await artifacts.sourceStore.putStructured(binaryHash, traceId, result.recipe, {
            capability: "aiMergeRecipe",
            model: config.model,
            at: artifacts.now,
            parentBinaryHash: binaryHash,
          });
        }
        const base = { ...result, model: config.model };
        return traceId ? { ...base, traceId, binaryHash } : base;
      } catch (e) {
        throw aiErrorToActionError(e, "Recipe merge failed");
      }
    }),
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
    handler: withOrigin({
      surface: "admin",
      action: "aiProposeIngredientLinks",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ recipeIngredients, locale }) => {
      const config = resolveAiConfig();
      const store = await createStore();
      const items = await store.list("ingredients");
      const inventory = items
        .filter((i) => i.id.startsWith(`${locale}/`))
        .map((i) => {
          const d = i.data as Record<string, unknown>;
          return {
            slug: i.id.slice(3),
            name: typeof d["name"] === "string" ? d["name"] : i.id.slice(3),
          };
        });
      const { proposeIngredientLinks } = await import("content-ai");
      return proposeIngredientLinks(recipeIngredients, inventory, config);
    }),
  }),

  /** Propose tags for a recipe. */
  aiProposeTags: defineAction({
    accept: "json",
    input: z.object({
      recipe: z.record(z.string(), z.unknown()),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiProposeTags",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ recipe }) => {
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
    }),
  }),

  /** Propose values for missing/weak recipe fields. */
  aiProposeRecipeImprovements: defineAction({
    accept: "json",
    input: z.object({
      recipe: z.record(z.string(), z.unknown()),
      missingFields: z.array(z.string()),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiProposeRecipeImprovements",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ recipe, missingFields }) => {
      const config = resolveAiConfig();
      const { proposeRecipeImprovements } = await import("content-ai");
      return proposeRecipeImprovements(recipe as never, missingFields, config);
    }),
  }),

  /** Draft a translation of recipe text fields into targetLocale. */
  aiTranslateRecipe: defineAction({
    accept: "json",
    input: z.object({
      recipe: z.record(z.string(), z.unknown()),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiTranslateRecipe",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ recipe, sourceLocale, targetLocale }) => {
      const config = resolveAiConfig();
      const { proposeRecipeTranslation } = await import("content-ai");
      return proposeRecipeTranslation(recipe as never, sourceLocale, targetLocale, config);
    }),
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
    handler: withOrigin({
      surface: "admin",
      action: "aiProposeIngredientPairings",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ ingredient, locale }) => {
      const config = resolveAiConfig();
      const store = await createStore();
      const items = await store.list("ingredients");
      const inventory = items
        .filter((i) => i.id.startsWith(`${locale}/`))
        .map((i) => {
          const d = i.data as Record<string, unknown>;
          return {
            slug: i.id.slice(3),
            name: typeof d["name"] === "string" ? d["name"] : i.id.slice(3),
          };
        });
      const { proposeIngredientPairings } = await import("content-ai");
      return proposeIngredientPairings(ingredient as never, inventory, config);
    }),
  }),

  /** Propose values for missing ingredient fields. */
  aiProposeIngredientImprovements: defineAction({
    accept: "json",
    input: z.object({
      ingredient: z.record(z.string(), z.unknown()),
      missingFields: z.array(z.string()),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiProposeIngredientImprovements",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ ingredient, missingFields }) => {
      const config = resolveAiConfig();
      const { proposeIngredientImprovements } = await import("content-ai");
      return proposeIngredientImprovements(ingredient as never, missingFields, config);
    }),
  }),

  /** Draft a translation of ingredient text fields into targetLocale. */
  aiTranslateIngredient: defineAction({
    accept: "json",
    input: z.object({
      ingredient: z.record(z.string(), z.unknown()),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiTranslateIngredient",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ ingredient, sourceLocale, targetLocale }) => {
      const config = resolveAiConfig();
      const { proposeIngredientTranslation } = await import("content-ai");
      return proposeIngredientTranslation(ingredient as never, sourceLocale, targetLocale, config);
    }),
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
    handler: withOrigin({
      surface: "admin",
      action: "aiMergeIngredient",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ existing, sourceKind, file, mimeType, text, prompt }) => {
      const config = resolveAiConfig();
      const { mergeIngredient } = await import("content-ai");
      const existingIngredient = JSON.parse(existing) as Record<string, unknown>;
      const source = await resolveMergeSource({ sourceKind, file, mimeType, text, prompt });
      const result = await mergeIngredient(
        { existing: existingIngredient as never, source },
        config,
      );
      return { ...result, model: config.model };
    }),
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
    handler: withOrigin({
      surface: "admin",
      action: "aiRefreshIngredientSuggestions",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ locale, slug, ingredient, existingMeta = {}, missingFields }) => {
      const config = resolveAiConfig();
      const { createAiEventLog } = await import("content-ai");
      const { runAiRefresh } = await import("@/lib/ai/runner.ts");
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      return runAiRefresh({
        kind: "ingredient",
        metaRef: { collection: "ingredients" as const, locale, slug },
        payload: ingredient,
        existingMeta,
        missingFields,
        locale,
        store,
        sidecar,
        eventLog: createAiEventLog(sidecar),
        config,
      });
    }),
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
    handler: withOrigin({
      surface: "admin",
      action: "aiCreateIngredientTranslation",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ slug, ingredient, sourceLocale, targetLocale }) => {
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

      const sidecar = createMetaSidecar(store);
      const translatedIngredient = { ...ingredient, ...translation.fields };
      await store.put("ingredients", `${targetLocale}/${slug}`, translatedIngredient);

      // Create minimal ingredient meta for the translation
      await sidecar.write(
        { collection: "ingredients", locale: targetLocale, slug },
        { translationOf: `${sourceLocale}/${slug}`, translations: {} },
      );

      // Back-link: update source meta to record the translation
      const sourceRef = { collection: "ingredients" as const, locale: sourceLocale, slug };
      const sourceMeta = (await sidecar.read(sourceRef))?.data as
        | Record<string, unknown>
        | undefined;
      const currentTranslations =
        typeof sourceMeta?.["translations"] === "object" && sourceMeta["translations"] !== null
          ? (sourceMeta["translations"] as Record<string, string>)
          : {};
      await sidecar.write(sourceRef, {
        ...sourceMeta,
        translations: { ...currentTranslations, [targetLocale]: `${targetLocale}/${slug}` },
      });

      return { ok: true, slug, targetLocale };
    }),
  }),

  /** Extract a Pairing from an uploaded file (PDF/image/text). */
  aiExtractPairing: defineAction({
    accept: "form",
    input: fileOrTextInput,
    handler: withOrigin({
      surface: "admin",
      action: "aiExtractPairing",
      entityKind: "pairing",
      triggeredBy: "editor",
      userInitiated: true,
    })(async (input) => {
      const config = resolveAiConfig();
      const { extractPairingFromFile } = await import("content-ai");
      const debug = isDebug(input.debug);
      const resolved = await resolveFileInput(input);
      const { sourceStore, binaryHash, extractionInput, now } = await persistSourceArtifacts(
        resolved,
        input.file?.name,
      );

      try {
        const result = await extractPairingFromFile(extractionInput, config, { debug });
        const traceId = crypto.randomUUID();
        await sourceStore.putStructured(binaryHash, traceId, result.pairing, {
          capability: "aiExtractPairing",
          model: config.model,
          at: now,
          parentBinaryHash: binaryHash,
        });
        const base = debug ? { ...result, model: config.model } : result;
        return { ...base, traceId, binaryHash };
      } catch (e) {
        throw aiErrorToActionError(e, "Pairing extraction failed");
      }
    }),
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
    handler: withOrigin({
      surface: "admin",
      action: "aiMergePairing",
      entityKind: "pairing",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ existing, locale, sourceKind, file, mimeType, text, prompt }) => {
      const config = resolveAiConfig();
      const { mergePairing } = await import("content-ai");
      const existingData = JSON.parse(existing) as Record<string, unknown>;
      const source = await resolveMergeSource({ sourceKind, file, mimeType, text, prompt });
      const result = await mergePairing(
        { existing: { ...existingData, locale } as never, source },
        config,
      );
      return { ...result, model: config.model };
    }),
  }),

  /** Translate a pairing description into targetLocale and save it in the descriptions map. */
  aiTranslatePairing: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiTranslatePairing",
      entityKind: "pairing",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ id, sourceLocale, targetLocale }) => {
      const config = resolveAiConfig();
      const { proposePairingTranslation } = await import("content-ai");
      const store = await createStore();

      const existing = await store.get("pairings", id);
      if (!existing)
        throw new ActionError({ code: "NOT_FOUND", message: `Pairing ${id} not found.` });

      const d = existing.data as Record<string, unknown>;
      const descriptions =
        (d["descriptions"] as Record<string, string>) ??
        (typeof d["description"] === "string" ? { en: d["description"] } : {});

      if (descriptions[targetLocale]) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Translation for ${targetLocale} already exists.`,
        });
      }

      const sourceDescription =
        descriptions[sourceLocale] ?? descriptions["en"] ?? Object.values(descriptions)[0] ?? "";
      const ings = d["ingredients"] as [EntityRef, EntityRef];
      const slug1 = typeof ings[0] === "string" ? ings[0] : (ings[0]?.slug ?? "");
      const slug2 = typeof ings[1] === "string" ? ings[1] : (ings[1]?.slug ?? "");

      const result = await proposePairingTranslation(
        { ingredient1: slug1, ingredient2: slug2, description: sourceDescription },
        sourceLocale,
        targetLocale,
        config,
      );

      const updatedDescriptions: Record<string, string> = {
        ...descriptions,
        [targetLocale]: result.fields["description"] ?? sourceDescription,
      };
      await store.put("pairings", id, { ingredients: ings, descriptions: updatedDescriptions });
      return { ok: true, description: updatedDescriptions[targetLocale] };
    }),
  }),

  /** Refresh AI improvement suggestions for a pairing description in a given locale. */
  aiRefreshPairingSuggestions: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      locale: z.string().length(2).default("en"),
      pairing: z.record(z.string(), z.unknown()),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiRefreshPairingSuggestions",
      entityKind: "pairing",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ id, locale, pairing }) => {
      const config = resolveAiConfig();
      const { createAiEventLog } = await import("content-ai");
      const { runAiRefresh } = await import("@/lib/ai/runner.ts");
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      return runAiRefresh({
        kind: "pairing",
        metaRef: { collection: "pairings", slug: id },
        payload: pairing,
        missingFields: [],
        locale,
        store,
        sidecar,
        eventLog: createAiEventLog(sidecar),
        config,
      });
    }),
  }),

  /** Check whether a slug is available in a given collection. */
  checkSlugAvailable: defineAction({
    accept: "json",
    input: z.object({
      collection: z.enum(["recipes", "mixtures", "ingredients"]),
      slug: z.string().min(1),
      locale: z.string().length(2).default("en"),
    }),
    handler: async ({ collection, slug, locale }) => {
      const store = await createStore();
      type C = Parameters<typeof store.get>[0];
      const existing = await store.get(collection as C, `${locale}/${slug}`);
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

  /** Merge-patch an ingredient's meta sidecar (e.g. to store aiEvents). */
  saveIngredientMeta: defineAction({
    accept: "json",
    input: z.object({
      locale: z.enum(["en", "de"]),
      slug: z.string().min(1),
      patch: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ locale, slug, patch }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libSaveIngredientMeta(sidecar, { locale, slug, patch });
      return { ok: true };
    },
  }),

  /** Merge-patch a pairing's meta sidecar (e.g. to store aiEvents). */
  savePairingMeta: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      patch: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ id, patch }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libSavePairingMeta(sidecar, { id, patch });
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
    handler: withOrigin({
      surface: "admin",
      action: "aiSuggestSlug",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ name, locale, collection }) => {
      const config = resolveAiConfig();
      const { proposeSlug } = await import("content-ai");
      const store = await createStore();

      const proposal = await proposeSlug(name, locale, config);
      let slug = proposal.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const existing = await store.get(collection, `${locale}/${slug}`);
      if (existing) {
        let i = 2;
        while (await store.get(collection, `${locale}/${slug}-${i}`)) i++;
        slug = `${slug}-${i}`;
      }
      return { slug };
    }),
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
      force: z.boolean().default(false),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiRefreshSuggestions",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ collection, slug, recipe, meta, missingFields, locale, force }) => {
      const config = resolveAiConfig();
      const { createAiEventLog } = await import("content-ai");
      const { runAiRefresh } = await import("@/lib/ai/runner.ts");
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      return runAiRefresh({
        kind: "recipe",
        metaRef: { collection, locale, slug },
        payload: recipe,
        existingMeta: meta,
        missingFields,
        locale,
        store,
        sidecar,
        eventLog: createAiEventLog(sidecar),
        config,
        force,
      });
    }),
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
    handler: withOrigin({
      surface: "admin",
      action: "aiCreateTranslation",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ collection, slug, recipe, meta, sourceLocale, targetLocale, translationSlug }) => {
      const config = resolveAiConfig();
      const { proposeRecipeTranslation } = await import("content-ai");
      const store = await createStore();
      const sidecar = createMetaSidecar(store);

      const existing = await store.get(collection, `${targetLocale}/${translationSlug}`);
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

      await store.put(collection, `${targetLocale}/${translationSlug}`, translatedRecipe);

      const translationMeta: Record<string, unknown> = {
        ...meta,
        draft: true,
        language: targetLocale,
        locale: targetLocale,
        translationOf: slug,
        translations: {},
        variants: [],
      };
      await sidecar.write(
        { collection, locale: targetLocale, slug: translationSlug },
        translationMeta,
      );

      // Back-link original → translation
      const currentTranslations =
        typeof meta["translations"] === "object" && meta["translations"] !== null
          ? (meta["translations"] as Record<string, string>)
          : {};
      await sidecar.write(
        { collection, locale: sourceLocale, slug },
        {
          ...meta,
          translations: { ...currentTranslations, [targetLocale]: translationSlug },
        },
      );

      return { ok: true, translationSlug };
    }),
  }),

  /** Create a minimal recipe stub (name only) for inline "create new" flow. */
  quickCreateRecipe: defineAction({
    accept: "json",
    input: z.object({
      collection: recipeCollectionEnum,
      slug: z.string().min(1),
      name: z.string().min(1),
      locale: z.enum(["en", "de"]),
    }),
    handler: async ({ collection, slug, name, locale }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await store.put(collection, `${locale}/${slug}`, {
        "@context": "https://schema.org",
        "@type": "Recipe",
        name,
        recipeIngredient: [""],
        recipeInstructions: [{ "@type": "HowToStep", text: "" }],
      });
      await sidecar.write(
        { collection, locale, slug },
        {
          draft: true,
          kind: collection === "recipes" ? "recipe" : "mixture",
          tags: [],
          ingredientLinks: [],
          externalSources: [],
          goesWellWith: [],
          usesBase: [],
          variants: [],
        },
      );
      return { ok: true, slug };
    },
  }),
};
