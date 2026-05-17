import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { createStore } from "@/lib/content-store.ts";
import { createMetaSidecar } from "@/lib/meta-sidecar.ts";
import { slugFromLocaleId } from "@/lib/recipe-augment.ts";
import { entityRefSchema } from "@/lib/entity-ref.ts";
import type { EntityRef } from "@/lib/entity-ref.ts";
import { endpointRefSchema } from "entity-kind";
import type { EndpointRef } from "entity-kind";
import { fetchRecipe } from "recipe-ingestion";
import { computeCompletenessFromBlob } from "@/lib/completeness.ts";
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
import { applyVariantsClosure } from "@/lib/variants-closure.ts";
import { NotFoundError } from "@/lib/errors.ts";
import { AiError, withOrigin, entityMeta, SidecarEventLog, hashSuggestion } from "content-ai";
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
  const sidecar = createMetaSidecar(store);

  const [recipes, mixtures, ingredients, pairings] = await Promise.all([
    store.list("recipes"),
    store.list("mixtures"),
    store.list("ingredients"),
    store.list("pairings"),
  ]);

  const recipeItems = await Promise.all(
    [...recipes, ...mixtures].map(async (item) => {
      const collection = item.collection as "recipes" | "mixtures";
      const slug = slugFromLocaleId(item.id);
      const slash = item.id.indexOf("/");
      const locale = slash === -1 ? "en" : item.id.slice(0, slash);
      const meta = await entityMeta.read(sidecar, { collection, locale, slug });
      const completeness = computeCompletenessFromBlob(
        "recipe",
        item.data as Record<string, unknown>,
        meta,
      );
      return {
        type: "recipe" as const,
        collection,
        id: slug,
        name: (item.data as Record<string, unknown>).name ?? slug,
        draft: meta.draft,
        completeness,
        updatedAt: item.updatedAt,
      };
    }),
  );

  const ingredientItems = await Promise.all(
    ingredients.map(async (item) => {
      const slash = item.id.indexOf("/");
      const locale = slash === -1 ? "en" : item.id.slice(0, slash);
      const slug = slugFromLocaleId(item.id);
      const meta = await entityMeta.read(sidecar, { collection: "ingredients", locale, slug });
      const completeness = computeCompletenessFromBlob(
        "ingredient",
        item.data as Record<string, unknown>,
        meta,
      );
      return {
        type: "ingredient" as const,
        collection: "ingredients" as const,
        id: item.id,
        name: (item.data as Record<string, unknown>).name ?? item.id,
        draft: meta.draft,
        completeness,
        updatedAt: item.updatedAt,
      };
    }),
  );

  const pairingItems = await Promise.all(
    pairings.map(async (item) => {
      const d = item.data as Record<string, unknown>;
      const ings = (d["ingredients"] as Array<EntityRef | string>) ?? [];
      const descriptions = (d["descriptions"] as Record<string, string>) ?? {};
      const pairingMeta = await entityMeta.read(sidecar, { collection: "pairings", slug: item.id });
      const completeness = computeCompletenessFromBlob("pairing", d, pairingMeta);
      const translations = ["en", "de"].filter((l) => !!descriptions[l]);
      const description =
        descriptions["en"] ?? (typeof d["description"] === "string" ? d["description"] : "");
      const refSlug = (v: EntityRef | string | undefined): string => {
        if (v == null) return "?";
        if (typeof v === "string") return v;
        return v.slug;
      };
      return {
        type: "pairing" as const,
        collection: "pairings" as const,
        id: item.id,
        name: `${refSlug(ings[0])} ↔ ${refSlug(ings[1])}`,
        draft: pairingMeta.draft,
        completeness,
        updatedAt: item.updatedAt,
        translations,
        subtitle: description
          ? description.slice(0, 100) + (description.length > 100 ? "…" : "")
          : undefined,
      };
    }),
  );

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

      // Translation metas (translationOf is set) never carry variants.
      let effectiveMeta = meta;
      if (meta !== undefined && Array.isArray(meta["variants"]) && !meta["translationOf"]) {
        const unifiedVariants = await applyVariantsClosure(
          sidecar,
          collection,
          slug,
          meta["variants"] as string[],
        );
        effectiveMeta = { ...meta, variants: unifiedVariants };
      }

      await libSaveEntity(store, sidecar, {
        ref: { collection, locale, slug },
        content: recipe,
        meta: effectiveMeta,
      });
      if (aiMergeModel) {
        const eventLog = new SidecarEventLog(sidecar);
        await eventLog.append(
          { collection, locale, slug },
          {
            type: "accepted",
            suggestion: { hash: hashSuggestion(recipe), summary: "AI-merged recipe accepted" },
            model: aiMergeModel,
            traceId,
          },
        );
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
      meta: z.record(z.string(), z.unknown()).optional(),
      aiMergeModel: z.string().optional(),
      traceId: z.string().optional(),
    }),
    handler: async ({ locale, slug, ingredient, meta, aiMergeModel, traceId }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libSaveEntity(store, sidecar, {
        ref: { collection: "ingredients", locale, slug },
        content: ingredient,
        meta,
      });
      if (aiMergeModel) {
        const eventLog = new SidecarEventLog(sidecar);
        await eventLog.append(
          { collection: "ingredients", locale, slug },
          {
            type: "accepted",
            suggestion: {
              hash: hashSuggestion(ingredient),
              summary: "AI-merged ingredient accepted",
            },
            model: aiMergeModel,
            traceId,
          },
        );
      }
      return { ok: true, slug };
    },
  }),

  /** Upsert a pairing entity. id = slug-a--slug-b (alphabetical). */
  savePairing: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      endpoints: z.tuple([endpointRefSchema, endpointRefSchema]),
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
      endpoints,
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
        endpoints,
        description,
        locale,
        image,
        imageAttribution,
      });
      await libSaveEntity(store, sidecar, {
        ref: { collection: "pairings", locale, slug: id },
        content: pairingData,
        meta: draft !== undefined ? { draft } : undefined,
      });
      if (aiMergeModel) {
        const eventLog = new SidecarEventLog(sidecar);
        await eventLog.append(
          { collection: "pairings", slug: id },
          {
            type: "accepted",
            field: "description",
            suggestion: {
              hash: hashSuggestion({ description, locale }),
              summary: `AI-enhanced pairing description (${locale}) accepted`,
            },
            model: aiMergeModel,
            traceId,
          },
        );
      }
      return { ok: true, id };
    },
  }),

  /** Toggle draft/published state for a pairing. */
  togglePairingDraft: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      locale: z.string().length(2).default("en"),
      draft: z.boolean(),
    }),
    handler: async ({ id, locale, draft }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      try {
        await libTogglePairingDraft(store, sidecar, { id, locale, draft });
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new ActionError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
      return { ok: true };
    },
  }),

  /** Delete a pairing locale record. */
  deletePairing: defineAction({
    accept: "json",
    input: z.object({ id: z.string().min(1), locale: z.string().length(2).default("en") }),
    handler: async ({ id, locale }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libDeletePairing(store, sidecar, { id, locale });
      return { ok: true };
    },
  }),

  /** List all pairing entities. */
  listAllPairings: defineAction({
    handler: async () => {
      const store = await createStore();
      const all = await store.list("pairings");
      return all.map((item) => {
        const d = item.data as Record<string, unknown>;
        return {
          id: item.id,
          endpoints: d["endpoints"] as [EndpointRef, EndpointRef],
          description: (d["description"] as string | undefined) ?? "",
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
      collection: z.enum(["ingredients", "mixtures", "recipes"]).optional(),
    }),
    handler: async ({ slug, collection }) => {
      const store = await createStore();
      const all = await store.list("pairings");
      return all
        .filter((item) => {
          const d = item.data as Record<string, unknown>;
          const eps = d["endpoints"];
          if (!Array.isArray(eps)) return false;
          return eps.some((ref: unknown) => {
            if (typeof ref === "object" && ref !== null && "slug" in ref) {
              const r = ref as EndpointRef;
              return r.slug === slug && (!collection || r.collection === collection);
            }
            return false;
          });
        })
        .map((item) => {
          const d = item.data as Record<string, unknown>;
          return {
            id: item.id,
            endpoints: d["endpoints"] as [EndpointRef, EndpointRef],
            description: (d["description"] as string | undefined) ?? "",
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
      const { runRefine } = await import("@pixelmord/content-ai-refine");
      const { recipeContract } = await import("@/contracts/index.ts");
      const { suggestions } = await runRefine({
        contract: recipeContract,
        currentData: { recipeIngredient: recipeIngredients } as never,
        sourceContext: { inventory },
        target: "ingredientLinks",
        config,
      });
      const sugg = suggestions.get("ingredientLinks");
      return sugg?.kind === "single"
        ? (sugg.value as Array<{ pattern: string; slug: string; confidence: string }>)
        : [];
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
      const { runRefine } = await import("@pixelmord/content-ai-refine");
      const { recipeContract } = await import("@/contracts/index.ts");
      const { suggestions } = await runRefine({
        contract: recipeContract,
        currentData: recipe as never,
        sourceContext: { existingTags: Array.from(tagSet) },
        target: "keywords",
        config,
      });
      const sugg = suggestions.get("keywords");
      return { tags: sugg?.kind === "single" ? (sugg.value as string[]) : [] };
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
      const { runRefine } = await import("@pixelmord/content-ai-refine");
      const { recipeContract } = await import("@/contracts/index.ts");
      const { suggestions } = await runRefine({
        contract: recipeContract,
        currentData: recipe as never,
        target: missingFields,
        config,
      });
      const fields = missingFields
        .filter((f) => suggestions.has(f))
        .map((f) => {
          const s = suggestions.get(f)!;
          return { field: f, suggestion: s.kind === "single" ? s.value : undefined, rationale: "" };
        });
      return { fields };
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
      const { runRefine } = await import("@pixelmord/content-ai-refine");
      const { ingredientContract } = await import("@/contracts/index.ts");
      const { suggestions } = await runRefine({
        contract: ingredientContract,
        currentData: ingredient as never,
        sourceContext: { inventory },
        target: "pairings",
        config,
      });
      const sugg = suggestions.get("pairings");
      return sugg?.kind === "single"
        ? (sugg.value as Array<{ slug: string; description: string; confidence: string }>)
        : [];
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
      const { runRefine } = await import("@pixelmord/content-ai-refine");
      const { ingredientContract } = await import("@/contracts/index.ts");
      const { suggestions } = await runRefine({
        contract: ingredientContract,
        currentData: ingredient as never,
        target: missingFields,
        config,
      });
      const fields = missingFields
        .filter((f) => suggestions.has(f))
        .map((f) => {
          const s = suggestions.get(f)!;
          return { field: f, suggestion: s.kind === "single" ? s.value : undefined, rationale: "" };
        });
      return { fields };
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
   * Save a pre-translated ingredient as a locale-twin.
   * Receives fields already translated by aiFillTranslation.
   * Returns CONFLICT if the target locale file already exists.
   */
  aiCreateIngredientTranslation: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
      fields: z.record(z.string(), z.unknown()),
      meta: z.record(z.string(), z.unknown()),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiCreateIngredientTranslation",
      entityKind: "ingredient",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ slug, sourceLocale, targetLocale, fields, meta }) => {
      const store = await createStore();

      const existing = await store.get("ingredients", `${targetLocale}/${slug}`);
      if (existing) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Translation already exists at ${targetLocale}/${slug}.`,
        });
      }

      const sidecar = createMetaSidecar(store);
      await store.put("ingredients", `${targetLocale}/${slug}`, fields);
      await sidecar.write({ collection: "ingredients", locale: targetLocale, slug }, meta);

      // Back-link: update source meta to record the translation
      const sourceRef = { collection: "ingredients" as const, locale: sourceLocale, slug };
      const sourceMeta = await entityMeta.read(sidecar, sourceRef);
      await entityMeta.merge(sidecar, sourceRef, {
        translations: {
          ...sourceMeta.translations,
          [targetLocale]: `${targetLocale}/${slug}`,
        },
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

  /** Save a pre-translated pairing description as a new per-locale record. */
  aiTranslatePairing: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
      description: z.string().min(1),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiTranslatePairing",
      entityKind: "pairing",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ id, sourceLocale, targetLocale, description }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);

      const existingTarget = await store.get("pairings", `${targetLocale}/${id}`);
      if (existingTarget) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Translation for ${targetLocale} already exists.`,
        });
      }

      const source = await store.get("pairings", `${sourceLocale}/${id}`);
      if (!source)
        throw new ActionError({
          code: "NOT_FOUND",
          message: `Pairing ${sourceLocale}/${id} not found.`,
        });

      const pairingData = await libBuildPairingData(store, {
        id,
        locale: targetLocale,
        endpoints: (source.data as Record<string, unknown>)["endpoints"] as [
          EndpointRef,
          EndpointRef,
        ],
        description,
      });
      await libSaveEntity(store, sidecar, {
        ref: { collection: "pairings", locale: targetLocale, slug: id },
        content: pairingData,
      });

      const sourceMeta = await entityMeta.read(sidecar, {
        collection: "pairings",
        locale: sourceLocale,
        slug: id,
      });
      const canonicalLocale = sourceMeta.canonicalLocale ?? sourceLocale;
      await entityMeta.merge(
        sidecar,
        { collection: "pairings", locale: targetLocale, slug: id },
        {
          canonicalLocale,
          translationOf: id,
          draft: false,
        },
      );
      await entityMeta.merge(
        sidecar,
        { collection: "pairings", locale: sourceLocale, slug: id },
        {
          translations: { ...sourceMeta.translations, [targetLocale]: `${targetLocale}/${id}` },
        },
      );

      return { ok: true, description };
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

  /**
   * Append a single AI event to an entity's meta sidecar via SidecarEventLog.
   * Used by client components that cannot access the sidecar directly.
   */
  aiRecordEvent: defineAction({
    accept: "json",
    input: z.object({
      collection: z.string().min(1),
      locale: z.string().length(2).optional(),
      slug: z.string().min(1),
      event: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ collection, locale, slug, event }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      const eventLog = new SidecarEventLog(sidecar);
      await eventLog.append(
        { collection, locale, slug },
        event as Parameters<typeof eventLog.append>[1],
      );
      return { ok: true };
    },
  }),

  /** Merge-patch a pairing's meta sidecar (e.g. to store aiEvents). */
  savePairingMeta: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1),
      locale: z.string().length(2).default("en"),
      patch: z.record(z.string(), z.unknown()),
    }),
    handler: async ({ id, locale, patch }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);
      await libSavePairingMeta(sidecar, { id, locale, patch });
      return { ok: true };
    },
  }),

  /**
   * Suggest a URL-safe slug derived from a recipe name via runRefine, with duplicate avoidance.
   *
   * Retained for non-translation slug generation (recipe creation/editing UI).
   * Translation slug generation goes through aiFillTranslation with target: ["slug"] via
   * TranslateEntityDialog — no sibling-locale source is needed here, so runRefine is correct.
   */
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
      const { runRefine } = await import("@pixelmord/content-ai-refine");
      const { recipeContract } = await import("@/contracts/index.ts");
      const store = await createStore();

      const { suggestions } = await runRefine({
        contract: recipeContract,
        currentData: { name } as never,
        sourceContext: { locale },
        target: "slug",
        config,
      });
      const slugSugg = suggestions.get("slug");
      const rawSlug =
        (slugSugg?.kind === "single" ? (slugSugg.value as string) : undefined) ?? name;
      let slug = rawSlug
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
   * Save a pre-translated recipe as a new linked document.
   * Receives fields already translated by aiFillTranslation.
   * Also updates the original's meta.translations map.
   */
  aiCreateTranslation: defineAction({
    accept: "json",
    input: z.object({
      collection: recipeCollectionEnum,
      slug: z.string().min(1),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
      translationSlug: z.string().min(1),
      fields: z.record(z.string(), z.unknown()),
      meta: z.record(z.string(), z.unknown()),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiCreateTranslation",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ collection, slug, sourceLocale, targetLocale, translationSlug, fields, meta }) => {
      const store = await createStore();
      const sidecar = createMetaSidecar(store);

      const existing = await store.get(collection, `${targetLocale}/${translationSlug}`);
      if (existing) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Slug "${translationSlug}" is already taken.`,
        });
      }

      await store.put(collection, `${targetLocale}/${translationSlug}`, fields);
      await sidecar.write({ collection, locale: targetLocale, slug: translationSlug }, meta);

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

  /** Run fill for translation via sibling-locale source; returns suggestions as plain records. */
  aiFillTranslation: defineAction({
    accept: "json",
    input: z.object({
      kind: z.enum(["recipe", "mixture", "ingredient", "pairing"]),
      sourceRef: z.object({ id: z.string(), kind: z.string() }),
      sourceLocale: z.enum(["en", "de"]),
      targetLocale: z.enum(["en", "de"]),
      sourceData: z.record(z.string(), z.unknown()),
      target: z.array(z.string()).optional(),
    }),
    handler: withOrigin({
      surface: "admin",
      action: "aiFillTranslation",
      entityKind: "recipe",
      triggeredBy: "editor",
      userInitiated: true,
    })(async ({ kind, sourceRef, sourceLocale, targetLocale, sourceData, target }) => {
      const config = resolveAiConfig();
      const {
        recipeTranslationContract,
        ingredientTranslationContract,
        pairingTranslationContract,
      } = await import("@/lib/ai/translation-contracts.ts");
      const { runFill } = await import("@pixelmord/content-ai-ingest");

      const contractByKind = {
        ingredient: ingredientTranslationContract,
        pairing: pairingTranslationContract,
        recipe: recipeTranslationContract,
        mixture: recipeTranslationContract,
      } as const;
      const contract = contractByKind[kind];

      const sourceContext = {
        kind: "sibling-locale" as const,
        sourceRef,
        sourceData,
        sourceLocale,
        targetLocale,
        fieldHashes: {} as Record<string, string>,
      };

      const result = await runFill({ contract, sourceContext, config });

      let suggestions = Object.fromEntries(result.suggestions);
      if (target && target.length > 0) {
        const targetSet = new Set(target);
        suggestions = Object.fromEntries(
          Object.entries(suggestions).filter(([f]) => targetSet.has(f)),
        );
      }

      return {
        suggestions,
        autoApplied: Object.fromEntries(result.autoApplied),
        traces: Object.fromEntries(result.traces),
      };
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
