import {
  proposeIngredientImprovements,
  proposeIngredientPairings,
  proposeRecipeImprovements,
  proposeTags,
  proposeIngredientLinks,
  proposeRelations,
  proposePairingImprovements,
  detectLanguage,
  isAllowedAutoApply,
  assertAutoApplyAllowed,
  hashSuggestion,
  hashContent,
  getCurrentOrigin,
  publish,
} from "content-ai";
import type { AiConfig, AiEventLog, AiEventSidecar, MetaRef } from "content-ai";
import type { EntityKind } from "entity-kind";
import type { ContentStore } from "@/lib/content-store.ts";
import type { EntityRef } from "@/lib/entity-ref.ts";

function slugFromLocaleId(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function withProgress<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const runId = getCurrentOrigin()?.runId;
  if (runId) publish(runId, { type: "proposer:start", name });
  return fn().then(
    (result) => {
      if (runId) publish(runId, { type: "proposer:done", name });
      return result;
    },
    (err: unknown) => {
      if (runId) publish(runId, { type: "proposer:done", name, error: String(err) });
      throw err;
    },
  );
}

export interface AiRefreshInput {
  kind: EntityKind;
  metaRef: MetaRef;
  payload: Record<string, unknown>;
  missingFields: string[];
  locale: string;
  store: ContentStore;
  sidecar: AiEventSidecar;
  eventLog: AiEventLog;
  config: AiConfig;
  force?: boolean;
  existingMeta?: Record<string, unknown>;
}

export interface AiRefreshResult {
  aiSuggestions: Record<string, unknown>;
  autoLinked: number;
  autoAppliedLinks?: string[];
  detectedLanguage?: string;
  skipped: boolean;
  cached?: boolean;
}

const PLACEHOLDER_PATTERNS =
  /example\.|placeholder\.|picsum\.|via\.placeholder\.|lorempixel\.|dummyimage\./i;

function filterImprovements(fields: Array<{ field: string; suggestion: unknown }>) {
  return fields.filter(
    (f) =>
      f.field !== "image" &&
      !(typeof f.suggestion === "string" && PLACEHOLDER_PATTERNS.test(f.suggestion)),
  );
}

async function runIngredientRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  const {
    metaRef,
    payload,
    missingFields,
    locale,
    store,
    eventLog,
    config,
    existingMeta = {},
  } = input;

  const existingEvents = await eventLog.read(metaRef);
  const rejectedContext = eventLog.buildRejectedContext(existingEvents);

  const ingredientItems = await store.list("ingredients");
  const inventory = ingredientItems
    .filter((i) => i.id.startsWith(`${locale}/`) && i.id !== `${locale}/${metaRef.slug}`)
    .map((i) => {
      const d = i.data as Record<string, unknown>;
      return {
        slug: i.id.slice(3),
        name: typeof d["name"] === "string" ? d["name"] : i.id.slice(3),
      };
    });

  const fieldsForAi = missingFields.filter((f) => f !== "image");

  const [improvementsResult, pairingsResult, langResult] = await Promise.allSettled([
    fieldsForAi.length
      ? proposeIngredientImprovements(payload as never, fieldsForAi, config, rejectedContext)
      : Promise.resolve({ fields: [] }),
    inventory.length
      ? proposeIngredientPairings(payload as never, inventory, config, rejectedContext)
      : Promise.resolve([]),
    !existingMeta["locale"]
      ? detectLanguage(
          [payload["name"], payload["summary"], payload["description"]]
            .filter(Boolean)
            .map(String)
            .join(" — "),
          config,
        )
      : Promise.resolve(null),
  ]);

  const rawImprovements =
    improvementsResult.status === "fulfilled" ? improvementsResult.value.fields : [];
  const filteredImprovements = filterImprovements(rawImprovements);
  const proposedPairings = pairingsResult.status === "fulfilled" ? pairingsResult.value : [];
  const detectedLanguage =
    langResult.status === "fulfilled" && langResult.value ? langResult.value.language : undefined;
  const languageMismatch = !!(detectedLanguage && detectedLanguage !== locale);

  const aiSuggestions = {
    improvements: filteredImprovements,
    pairings: proposedPairings.map((p) => ({
      slug: p.slug,
      description: p.description,
      confidence: p.confidence,
    })),
    detectedLanguage,
    languageMismatch,
  };

  const toAutoApply = proposedPairings.filter((p) =>
    isAllowedAutoApply("pairing-slug", p.confidence, "editor"),
  );
  let autoLinked = 0;

  if (toAutoApply.length > 0) {
    const existingPairings = await store.list("pairings");
    const existingIds = new Set(existingPairings.map((p) => p.id));
    const runId = getCurrentOrigin()?.runId;
    for (const pairing of toAutoApply) {
      const id = [metaRef.slug, pairing.slug].sort().join("--");
      if (!existingIds.has(id)) {
        assertAutoApplyAllowed("pairing-slug", pairing.confidence, "editor");
        const ref1: EntityRef = { collection: "ingredients", slug: metaRef.slug };
        const ref2: EntityRef = { collection: "ingredients", slug: pairing.slug };
        const sortedRefs = [ref1, ref2].sort((a, b) => a.slug.localeCompare(b.slug)) as [
          EntityRef,
          EntityRef,
        ];
        await store.put("pairings", id, {
          ingredients: sortedRefs,
          description: pairing.description,
        });
        await eventLog.append(metaRef, {
          type: "auto-applied",
          field: "pairings",
          suggestion: {
            hash: hashSuggestion({ slug: metaRef.slug, pairingSlug: pairing.slug }),
            summary: `Pairing auto-applied: ${metaRef.slug} ↔ ${pairing.slug}`,
          },
          model: config.model,
          confidence: pairing.confidence,
          traceId: runId,
        });
        autoLinked++;
      }
    }
  }

  return { aiSuggestions, autoLinked, skipped: false };
}

async function runRecipeRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  const {
    metaRef,
    payload,
    missingFields,
    locale,
    store,
    sidecar,
    eventLog,
    config,
    force,
    existingMeta: meta = {},
  } = input;

  const skipResult = await eventLog.shouldSkip(
    metaRef,
    { recipe: payload, missingFields, locale, model: config.model },
    force,
  );
  if (skipResult.skip) {
    return {
      aiSuggestions: skipResult.cachedSuggestion,
      autoLinked: 0,
      autoAppliedLinks: [],
      detectedLanguage: skipResult.cachedSuggestion["detectedLanguage"] as string | undefined,
      skipped: false,
      cached: true,
    };
  }

  const { fingerprint, existingEvents } = skipResult;
  const rejectedContext = eventLog.buildRejectedContext(existingEvents);

  const ingredientItems = await store.list("ingredients");
  const inventory = ingredientItems
    .filter((i) => i.id.startsWith(`${locale}/`))
    .map((i) => {
      const d = i.data as Record<string, unknown>;
      return {
        slug: i.id.slice(3),
        name: typeof d["name"] === "string" ? d["name"] : i.id.slice(3),
      };
    });

  const [recipes, mixtures] = await Promise.all([store.list("recipes"), store.list("mixtures")]);
  const existingRecipes = [
    ...recipes.map((r) => {
      const d = r.data as Record<string, unknown>;
      return {
        collection: "recipes" as const,
        slug: slugFromLocaleId(r.id),
        name: typeof d.name === "string" ? d.name : slugFromLocaleId(r.id),
        recipeIngredient: d.recipeIngredient as string[] | undefined,
      };
    }),
    ...mixtures.map((r) => {
      const d = r.data as Record<string, unknown>;
      return {
        collection: "mixtures" as const,
        slug: slugFromLocaleId(r.id),
        name: typeof d.name === "string" ? d.name : slugFromLocaleId(r.id),
      };
    }),
  ].filter((r) => r.slug !== metaRef.slug);

  const recipeIngredients = Array.isArray(payload["recipeIngredient"])
    ? (payload["recipeIngredient"] as string[])
    : [];
  const fieldsForAi = missingFields.filter((f) => f !== "image");

  const [improvementsResult, tagsResult, linksResult, relationsResult, langResult] =
    await Promise.allSettled([
      fieldsForAi.length
        ? withProgress("improvements", () =>
            proposeRecipeImprovements(payload as never, fieldsForAi, config, rejectedContext),
          )
        : Promise.resolve({ fields: [] }),
      withProgress("tags", () => proposeTags(payload as never, [], config, rejectedContext)),
      recipeIngredients.length
        ? withProgress("links", () =>
            proposeIngredientLinks(recipeIngredients, inventory, config, rejectedContext),
          )
        : Promise.resolve([]),
      withProgress("relations", () =>
        proposeRelations(payload as never, existingRecipes, config, rejectedContext),
      ),
      !meta["language"]
        ? withProgress("language", () =>
            detectLanguage(
              [payload["name"], payload["description"]].filter(Boolean).map(String).join(" — "),
              config,
            ),
          )
        : Promise.resolve(null),
    ]);

  const rawImprovements =
    improvementsResult.status === "fulfilled" ? improvementsResult.value.fields : [];
  const filteredImprovements = filterImprovements(rawImprovements);
  const detectedLanguage =
    langResult.status === "fulfilled" && langResult.value ? langResult.value.language : undefined;
  const ingredientLinks = linksResult.status === "fulfilled" ? linksResult.value : [];

  const aiSuggestions = {
    improvements: filteredImprovements,
    tags: tagsResult.status === "fulfilled" ? tagsResult.value.tags : [],
    ingredientLinks,
    relations: relationsResult.status === "fulfilled" ? relationsResult.value : [],
    detectedLanguage,
  };

  const existingLinks = Array.isArray(meta["ingredientLinks"])
    ? (meta["ingredientLinks"] as Array<Record<string, unknown>>)
    : [];
  const existingPatterns = new Set(
    existingLinks.map((l) => (typeof l["pattern"] === "string" ? l["pattern"] : "")),
  );
  const toAutoApply = ingredientLinks.filter(
    (l) =>
      isAllowedAutoApply("ingredient-link", l.confidence, "editor") &&
      !existingPatterns.has(l.pattern),
  );

  const updatedMeta: Record<string, unknown> = { ...meta };
  const runId = getCurrentOrigin()?.runId;

  if (toAutoApply.length > 0) {
    updatedMeta["ingredientLinks"] = [
      ...existingLinks,
      ...toAutoApply.map((l) => ({ pattern: l.pattern, slug: l.slug, kind: "ingredient" })),
    ];
    for (const link of toAutoApply) {
      assertAutoApplyAllowed("ingredient-link", link.confidence, "editor");
      await eventLog.append(metaRef, {
        type: "auto-applied",
        field: "ingredientLinks",
        suggestion: {
          hash: hashSuggestion({ pattern: link.pattern, slug: link.slug }),
          summary: `Link ${link.pattern} → ${link.slug}`,
        },
        model: config.model,
        confidence: link.confidence,
        traceId: runId,
      });
    }
  }

  if (!meta["language"] && detectedLanguage) {
    assertAutoApplyAllowed("language-detection", "high", "editor");
    updatedMeta["language"] = detectedLanguage;
    updatedMeta["locale"] = detectedLanguage;
    await eventLog.append(metaRef, {
      type: "auto-applied",
      field: "language",
      suggestion: {
        hash: hashSuggestion({ language: detectedLanguage }),
        summary: `Language detected: ${detectedLanguage}`,
      },
      model: config.model,
      confidence: "high",
      traceId: runId,
    });
  }

  // Re-read after appends so aiEvents in newMeta are current.
  const freshItem = await sidecar.read(metaRef);
  const freshMeta = (freshItem?.data as Record<string, unknown> | undefined) ?? meta;
  const newMeta: Record<string, unknown> = {
    ...freshMeta,
    ...updatedMeta,
    aiSuggestions: {
      fingerprint,
      at: new Date().toISOString(),
      model: config.model,
      data: aiSuggestions,
    },
  };

  const stripTimestamp = (m: Record<string, unknown>) => {
    const cache = m["aiSuggestions"] as { at?: string } | undefined;
    return cache ? { ...m, aiSuggestions: { ...cache, at: "" } } : m;
  };
  if (hashContent(stripTimestamp(newMeta)) !== hashContent(stripTimestamp(meta))) {
    await sidecar.write(metaRef, newMeta);
  }

  return {
    aiSuggestions,
    autoLinked: toAutoApply.length,
    autoAppliedLinks: toAutoApply.map((l) => l.pattern),
    detectedLanguage,
    skipped: false,
    cached: false,
  };
}

async function runPairingRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  const { metaRef, payload, locale, eventLog, config } = input;

  const existingEvents = await eventLog.read(metaRef);
  const rejectedContext = eventLog.buildRejectedContext(existingEvents);

  type IngRef = EntityRef | string | undefined;
  const ings = payload["ingredients"] as [IngRef, IngRef] | undefined;
  const refSlug = (v: IngRef): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return v.slug;
  };

  const descriptions = (payload["descriptions"] as Record<string, string>) ?? {};
  const description =
    descriptions[locale] ??
    descriptions["en"] ??
    (typeof payload["description"] === "string" ? payload["description"] : "");

  const improvements = await proposePairingImprovements(
    { ingredient1: refSlug(ings?.[0]), ingredient2: refSlug(ings?.[1]), description },
    locale,
    config,
    rejectedContext,
  );

  return {
    aiSuggestions: { [locale]: { improvements: improvements.fields } },
    autoLinked: 0,
    skipped: false,
  };
}

export async function runAiRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  switch (input.kind) {
    case "ingredient":
      return runIngredientRefresh(input);
    case "recipe":
      return runRecipeRefresh(input);
    case "pairing":
      return runPairingRefresh(input);
    default: {
      const _exhaustive: never = input.kind;
      throw new Error(`Unknown EntityKind: ${String(_exhaustive)}`);
    }
  }
}
