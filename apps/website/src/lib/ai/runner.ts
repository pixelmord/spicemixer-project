import {
  hashSuggestion,
  hashContent,
  getCurrentOrigin,
  publish,
  metaRefToEntityRef,
} from "content-ai";
import type { AiConfig, AiEventSidecar, MetaRef, SidecarEventLog, Confidence } from "content-ai";
import type { EndpointRef } from "entity-kind";
import { runRefine } from "@pixelmord/content-ai-refine";
import type { AiEvent as RefineAiEvent } from "@pixelmord/content-ai-refine";
import { ingredientContract } from "@/contracts/ingredientContract.ts";
import { recipeContract } from "@/contracts/recipeContract.ts";
import { pairingContract } from "@/contracts/pairingContract.ts";
import type { EntityKind } from "entity-kind";
import type { ContentStore } from "@/lib/content-store.ts";
import type { EntityRef } from "@/lib/entity-ref.ts";

function isHighConfidence(confidence: Confidence | number): boolean {
  if (typeof confidence === "number") return confidence >= 0.85;
  return confidence === "high";
}

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
  eventLog: SidecarEventLog;
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

  const entityRef = metaRefToEntityRef(metaRef);
  const existingEvents = await eventLog.read(entityRef);

  const [ingredientItems, mixtureItems] = await Promise.all([
    store.list("ingredients"),
    store.list("mixtures"),
  ]);
  const inventory = [
    ...ingredientItems
      .filter((i) => i.id.startsWith(`${locale}/`) && i.id !== `${locale}/${metaRef.slug}`)
      .map((i) => {
        const d = i.data as Record<string, unknown>;
        return {
          collection: "ingredients" as const,
          slug: i.id.slice(3),
          name: typeof d["name"] === "string" ? d["name"] : i.id.slice(3),
        };
      }),
    ...mixtureItems
      .filter((i) => i.id.startsWith(`${locale}/`))
      .map((i) => {
        const d = i.data as Record<string, unknown>;
        const raw = i.id.slice(3);
        return {
          collection: "mixtures" as const,
          slug: raw,
          name: typeof d["name"] === "string" ? d["name"] : raw,
        };
      }),
  ];

  const fieldsForAi = missingFields.filter((f) => f !== "image");
  const targetFields = [
    ...fieldsForAi,
    ...(inventory.length ? ["pairings"] : []),
    ...(!existingMeta["locale"] ? ["language"] : []),
  ];

  const { suggestions, autoApplied } = await runRefine({
    contract: ingredientContract,
    currentData: payload as never,
    sourceContext: { inventory, locale },
    target: targetFields,
    events: existingEvents as unknown as RefineAiEvent[],
    config,
  });

  const rawImprovements = fieldsForAi
    .filter((f) => suggestions.has(f))
    .map((f) => {
      const sugg = suggestions.get(f)!;
      return { field: f, suggestion: sugg.kind === "single" ? sugg.value : undefined };
    });
  const filteredImprovements = filterImprovements(
    rawImprovements as Array<{ field: string; suggestion: unknown }>,
  );

  const pairingsSugg = suggestions.get("pairings");
  const pairingsTraceId = pairingsSugg?.traceId;
  const proposedPairings =
    pairingsSugg?.kind === "single"
      ? (pairingsSugg.value as Array<{
          otherCollection: EndpointRef["collection"];
          otherSlug: string;
          rationale: string;
          confidence: Confidence;
        }>)
      : [];

  const langApplied = autoApplied.get("language");
  const langSugg = suggestions.get("language");
  const detectedLanguage = (langApplied?.value ??
    (langSugg?.kind === "single" ? langSugg.value : undefined)) as string | undefined;
  const languageMismatch = !!(detectedLanguage && detectedLanguage !== locale);

  const aiSuggestions = {
    improvements: filteredImprovements,
    pairings: proposedPairings.map((p) => ({
      otherCollection: p.otherCollection,
      otherSlug: p.otherSlug,
      rationale: p.rationale,
      traceId: pairingsTraceId,
    })),
    detectedLanguage,
    languageMismatch,
  };

  const toAutoApply = proposedPairings.filter((p) => isHighConfidence(p.confidence));
  let autoLinked = 0;

  if (toAutoApply.length > 0) {
    const existingPairings = await store.list("pairings");
    const existingIds = new Set(existingPairings.map((p) => p.id));
    const runId = getCurrentOrigin()?.runId;
    for (const pairing of toAutoApply) {
      const id = [metaRef.slug, pairing.otherSlug].sort().join("--");
      if (!existingIds.has(id)) {
        const ref1: EndpointRef = { collection: "ingredients", slug: metaRef.slug };
        const ref2: EndpointRef = { collection: pairing.otherCollection, slug: pairing.otherSlug };
        const sortedRefs = [ref1, ref2].sort((a, b) => a.slug.localeCompare(b.slug)) as [
          EndpointRef,
          EndpointRef,
        ];
        await store.put("pairings", id, {
          endpoints: sortedRefs,
          description: pairing.rationale,
        });
        await eventLog.append(entityRef, {
          type: "auto-applied",
          field: "pairings",
          suggestion: {
            hash: hashSuggestion({ slug: metaRef.slug, pairingSlug: pairing.otherSlug }),
            summary: `Pairing auto-applied: ${metaRef.slug} ↔ ${pairing.otherSlug}`,
          },
          model: config.model,
          confidence: pairing.confidence,
          traceId: runId ?? pairingsTraceId,
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

  const entityRef = metaRefToEntityRef(metaRef);
  const skipResult = await eventLog.checkFingerprint(
    entityRef,
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

  const hasPairableEntities = inventory.length > 0 || existingRecipes.length > 0;
  const targetFields = [
    ...fieldsForAi,
    "keywords",
    ...(recipeIngredients.length ? ["ingredientLinks"] : []),
    ...(existingRecipes.length ? ["relations"] : []),
    ...(hasPairableEntities ? ["pairings"] : []),
    ...(!meta["language"] ? ["language"] : []),
  ];

  const { suggestions, autoApplied } = await withProgress("refine", () =>
    runRefine({
      contract: recipeContract,
      currentData: payload as never,
      sourceContext: { inventory, existingTags: [], existingRecipes, locale },
      target: targetFields,
      events: existingEvents as unknown as RefineAiEvent[],
      config,
    }),
  );

  const rawImprovements = fieldsForAi
    .filter((f) => suggestions.has(f))
    .map((f) => {
      const sugg = suggestions.get(f)!;
      return { field: f, suggestion: sugg.kind === "single" ? sugg.value : undefined };
    });
  const filteredImprovements = filterImprovements(
    rawImprovements as Array<{ field: string; suggestion: unknown }>,
  );

  const keywordsSugg = suggestions.get("keywords");
  const tags =
    keywordsSugg?.kind === "single" ? (keywordsSugg.value as string[]) : ([] as string[]);

  const linksSugg = suggestions.get("ingredientLinks");
  const ingredientLinks =
    linksSugg?.kind === "single"
      ? (linksSugg.value as Array<{ pattern: string; slug: string; confidence: Confidence }>)
      : [];

  const relationsSugg = suggestions.get("relations");
  const relations =
    relationsSugg?.kind === "single"
      ? (relationsSugg.value as Array<{
          kind: string;
          collection: string;
          slug: string;
          name: string;
          rationale: string;
        }>)
      : [];

  const pairingsSugg = suggestions.get("pairings");
  const pairingsTraceId = pairingsSugg?.traceId;
  const pairings =
    pairingsSugg?.kind === "single"
      ? (
          pairingsSugg.value as Array<{
            otherCollection: EndpointRef["collection"];
            otherSlug: string;
            rationale: string;
          }>
        ).map((p) => ({ ...p, traceId: pairingsTraceId }))
      : [];

  const langApplied = autoApplied.get("language");
  const langSugg = suggestions.get("language");
  const detectedLanguage = (langApplied?.value ??
    (langSugg?.kind === "single" ? langSugg.value : undefined)) as string | undefined;

  const aiSuggestions = {
    improvements: filteredImprovements,
    tags,
    ingredientLinks,
    relations,
    pairings,
    detectedLanguage,
  };

  const existingLinks = Array.isArray(meta["ingredientLinks"])
    ? (meta["ingredientLinks"] as Array<Record<string, unknown>>)
    : [];
  const existingPatterns = new Set(
    existingLinks.map((l) => (typeof l["pattern"] === "string" ? l["pattern"] : "")),
  );
  const toAutoApply = ingredientLinks.filter(
    (l) => isHighConfidence(l.confidence) && !existingPatterns.has(l.pattern),
  );

  const updatedMeta: Record<string, unknown> = { ...meta };
  const runId = getCurrentOrigin()?.runId;

  if (toAutoApply.length > 0) {
    updatedMeta["ingredientLinks"] = [
      ...existingLinks,
      ...toAutoApply.map((l) => ({ pattern: l.pattern, slug: l.slug, kind: "ingredient" })),
    ];
    for (const link of toAutoApply) {
      await eventLog.append(entityRef, {
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
    updatedMeta["language"] = detectedLanguage;
    updatedMeta["locale"] = detectedLanguage;
    await eventLog.append(entityRef, {
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

  const existingEvents = await eventLog.read(metaRefToEntityRef(metaRef));

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

  const { suggestions } = await runRefine({
    contract: pairingContract,
    currentData: {
      description,
      ingredients: [refSlug(ings?.[0]), refSlug(ings?.[1])],
    } as never,
    sourceContext: { locale },
    events: existingEvents as unknown as RefineAiEvent[],
    config,
  });

  const descSugg = suggestions.get("description");
  const improvements = descSugg
    ? [
        {
          field: "description",
          suggestion: descSugg.kind === "single" ? descSugg.value : undefined,
        },
      ]
    : [];

  return {
    aiSuggestions: { [locale]: { improvements } },
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
