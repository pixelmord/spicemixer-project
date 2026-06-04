import { hashSuggestion, hashContent } from "@pixelmord/content-ai-core";
import { getCurrentOrigin } from "@pixelmord/content-ai-core/server";
import type { AiConfig } from "@pixelmord/content-ai-core";
import { aiLogger } from "@/lib/logger.ts";
import { publish } from "@/lib/pubsub.ts";
import { metaRefToEntityRef } from "@/lib/sidecar-event-log.ts";
import type { AiEventSidecar, MetaRef, SidecarEventLog } from "@/lib/sidecar-event-log.ts";
import type { EndpointRef, EntityKind } from "entity-kind";
import { runRefine } from "@pixelmord/content-ai-refine";
import type { AiEvent as RefineAiEvent } from "@pixelmord/content-ai-refine";
import { ingredientContract } from "@/contracts/ingredientContract.ts";
import { recipeContract } from "@/contracts/recipeContract.ts";
import { pairingContract } from "@/contracts/pairingContract.ts";
import type { ContentStore } from "@/lib/content-store.ts";
import type { EntityRef } from "@/lib/entity-ref.ts";

type Confidence = "high" | "medium" | "low";

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
  /**
   * Per-field run scope. When set, the runner treats this as an explicit
   * per-field request: it limits the refine target to exactly these fields
   * and skips side-effect proposers (pairings auto-apply, language detection)
   * that would write to disk and trigger HMR reloads of unsaved form state.
   */
  target?: string[];
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
  /** Per-field errors from runRefine — surfaces to UI for toast. */
  errors?: Array<{ field: string; message: string }>;
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
    target,
    locale,
    store,
    eventLog,
    config,
    existingMeta = {},
  } = input;

  const isPerField = target !== undefined;

  const entityRef = metaRefToEntityRef(metaRef);
  const existingEvents = await eventLog.read(entityRef);

  // Skip inventory listing entirely on per-field runs — it's only used to
  // build the cross-collection candidate set for the pairings proposer.
  const [ingredientItems, mixtureItems] = isPerField
    ? [[] as Awaited<ReturnType<typeof store.list>>, [] as Awaited<ReturnType<typeof store.list>>]
    : await Promise.all([store.list("ingredients"), store.list("mixtures")]);
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

  const fieldsForAi = (isPerField ? target : missingFields).filter((f) => f !== "image");
  // Per-field runs target exactly what the client asked for. Full refreshes
  // also include pairings (auto-apply) and language detection — both of which
  // can write files; OK only when the user expects a full re-evaluation.
  const targetFields = isPerField
    ? fieldsForAi
    : [
        ...fieldsForAi,
        ...(inventory.length ? ["pairings"] : []),
        ...(!existingMeta["locale"] ? ["language"] : []),
      ];

  const {
    suggestions,
    autoApplied,
    errors: errorsMap,
  } = await runRefine({
    contract: ingredientContract,
    currentData: payload as never,
    sourceContext: { inventory, locale },
    target: targetFields,
    events: existingEvents as unknown as RefineAiEvent[],
    config,
    logger: aiLogger.child({ kind: "ingredient", slug: metaRef.slug }),
  });

  const ingredientErrors = errorsMap
    ? Array.from(errorsMap.values()).map((e) => ({ field: e.field, message: e.message }))
    : [];

  if (ingredientErrors.length > 0 && suggestions.size === 0 && autoApplied.size === 0) {
    // Total failure for this run — surface to caller. The action wrapper will
    // turn this into an ActionError the UI can show.
    const first = ingredientErrors[0];
    throw new Error(
      first ? `AI suggest failed for ${first.field}: ${first.message}` : "AI suggest failed",
    );
  }

  const rawImprovements = fieldsForAi
    .filter((f) => suggestions.has(f))
    .map((f) => {
      const sugg = suggestions.get(f)!;
      const isSingle = sugg.kind === "single";
      return {
        field: f,
        suggestion: isSingle ? sugg.value : undefined,
        summary: isSingle ? sugg.summary : `AI suggestion for ${f}`,
        hash: isSingle ? sugg.hash : undefined,
        traceId: sugg.traceId,
        confidence: isSingle ? sugg.confidence : undefined,
      };
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

  return { aiSuggestions, autoLinked, skipped: false, errors: ingredientErrors };
}

async function runRecipeRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  const {
    metaRef,
    payload,
    missingFields,
    target,
    locale,
    store,
    sidecar,
    eventLog,
    config,
    force,
    existingMeta: meta = {},
  } = input;

  const isPerField = target !== undefined;

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

  // Inventory + cross-collection listing is only needed to build the candidate
  // set for the pairings/relations proposers. Per-field runs target exactly
  // what the client asked for and skip those proposers entirely.
  const ingredientItems = isPerField ? [] : await store.list("ingredients");
  const inventory = ingredientItems
    .filter((i) => i.id.startsWith(`${locale}/`))
    .map((i) => {
      const d = i.data as Record<string, unknown>;
      return {
        slug: i.id.slice(3),
        name: typeof d["name"] === "string" ? d["name"] : i.id.slice(3),
      };
    });

  const [recipes, mixtures] = isPerField
    ? [[] as Awaited<ReturnType<typeof store.list>>, [] as Awaited<ReturnType<typeof store.list>>]
    : await Promise.all([store.list("recipes"), store.list("mixtures")]);
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
  const fieldsForAi = (isPerField ? target : missingFields).filter((f) => f !== "image");

  // Per-field runs target only the fields the client requested. Full refreshes
  // additionally include the side-effect proposers (keywords, ingredientLinks,
  // relations, pairings, language) which can write to disk and trigger HMR
  // reloads of unsaved form state.
  const hasPairableEntities = inventory.length > 0 || existingRecipes.length > 0;
  const targetFields = isPerField
    ? fieldsForAi
    : [
        ...fieldsForAi,
        "keywords",
        "tags",
        ...(recipeIngredients.length ? ["ingredientLinks"] : []),
        ...(existingRecipes.length ? ["relations"] : []),
        ...(hasPairableEntities ? ["pairings"] : []),
        ...(!meta["language"] ? ["language"] : []),
      ];

  // Fields surfaced through aiSuggestions.improvements (inline UI cards). Anything
  // not here is either a side-effect proposer (ingredientLinks/pairings/relations
  // — extracted to dedicated top-level keys below) or the language detector.
  const IMPROVEMENT_FIELDS = new Set([...fieldsForAi, "keywords", "tags"]);

  const {
    suggestions,
    autoApplied,
    errors: recipeErrorsMap,
  } = await withProgress("refine", () =>
    runRefine({
      contract: recipeContract,
      currentData: payload as never,
      sourceContext: { inventory, existingTags: [], existingRecipes, locale },
      target: targetFields,
      events: existingEvents as unknown as RefineAiEvent[],
      config,
      logger: aiLogger.child({ kind: "recipe", slug: metaRef.slug }),
    }),
  );

  const recipeErrors = recipeErrorsMap
    ? Array.from(recipeErrorsMap.values()).map((e) => ({ field: e.field, message: e.message }))
    : [];

  if (recipeErrors.length > 0 && suggestions.size === 0 && autoApplied.size === 0) {
    const first = recipeErrors[0];
    throw new Error(
      first ? `AI suggest failed for ${first.field}: ${first.message}` : "AI suggest failed",
    );
  }

  const rawImprovements = [...IMPROVEMENT_FIELDS]
    .filter((f) => suggestions.has(f))
    .map((f) => {
      const sugg = suggestions.get(f)!;
      const isSingle = sugg.kind === "single";
      return {
        field: f,
        suggestion: isSingle ? sugg.value : undefined,
        summary: isSingle ? sugg.summary : `AI suggestion for ${f}`,
        hash: isSingle ? sugg.hash : undefined,
        traceId: sugg.traceId,
        confidence: isSingle ? sugg.confidence : undefined,
      };
    });
  const filteredImprovements = filterImprovements(
    rawImprovements as Array<{ field: string; suggestion: unknown }>,
  );

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
  // Per-field runs never auto-apply: persistence happens on the user's save.
  const toAutoApply = isPerField
    ? []
    : ingredientLinks.filter(
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

  if (!isPerField && !meta["language"] && detectedLanguage) {
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

  // Per-field runs do not persist the meta sidecar — writing to disk would
  // trip Astro's content watcher and wipe the just-arrived suggestion from
  // the client's form state.
  if (!isPerField) {
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
  }

  return {
    aiSuggestions,
    autoLinked: toAutoApply.length,
    autoAppliedLinks: toAutoApply.map((l) => l.pattern),
    detectedLanguage,
    skipped: false,
    cached: false,
    errors: recipeErrors,
  };
}

async function runPairingRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  const { metaRef, payload, target, locale, eventLog, config } = input;

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

  const { suggestions, errors: pairingErrorsMap } = await runRefine({
    contract: pairingContract,
    currentData: {
      description,
      ingredients: [refSlug(ings?.[0]), refSlug(ings?.[1])],
    } as never,
    sourceContext: { locale },
    ...(target ? { target } : {}),
    events: existingEvents as unknown as RefineAiEvent[],
    config,
    logger: aiLogger.child({ kind: "pairing", slug: metaRef.slug }),
  });

  const pairingErrors = pairingErrorsMap
    ? Array.from(pairingErrorsMap.values()).map((e) => ({ field: e.field, message: e.message }))
    : [];

  if (pairingErrors.length > 0 && suggestions.size === 0) {
    const first = pairingErrors[0];
    throw new Error(
      first ? `AI suggest failed for ${first.field}: ${first.message}` : "AI suggest failed",
    );
  }

  const descSugg = suggestions.get("description");
  const isSingle = descSugg?.kind === "single";
  const improvements = descSugg
    ? [
        {
          field: "description",
          suggestion: isSingle ? descSugg.value : undefined,
          summary: isSingle ? descSugg.summary : `AI suggestion for description`,
          hash: isSingle ? descSugg.hash : undefined,
          traceId: descSugg.traceId,
          confidence: isSingle ? descSugg.confidence : undefined,
        },
      ]
    : [];

  return {
    aiSuggestions: { [locale]: { improvements } },
    autoLinked: 0,
    skipped: false,
    errors: pairingErrors,
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
