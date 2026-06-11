import { hashSuggestion, hashContent } from "@pixelmord/content-ai-core";
import { getCurrentOrigin } from "@pixelmord/content-ai-core/server";
import type { AiConfig } from "@pixelmord/content-ai-core";
import { aiLogger } from "@/lib/logger.ts";
import { publish } from "@/lib/pubsub.ts";
import { metaRefToEntityRef } from "@/lib/sidecar-event-log.ts";
import type { AiEventSidecar, MetaRef, SidecarEventLog } from "@/lib/sidecar-event-log.ts";
import type { EndpointRef, EntityKind } from "entity-kind";
import { runRefine, runRefresh } from "@pixelmord/content-ai-refine";
import type { AiEvent as RefineAiEvent, RawImprovement } from "@pixelmord/content-ai-refine";
import { ingredientContract } from "@/contracts/ingredientContract.ts";
import { recipeContract } from "@/contracts/recipeContract.ts";
import { pairingContract } from "@/contracts/pairingContract.ts";
import type { ContentStore } from "@/lib/content-store.ts";
import type { EntityRef } from "@/lib/entity-ref.ts";
import { type Confidence, planLinkAutoApply, planPairingAutoApply } from "@/lib/ai/auto-apply.ts";

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

/** Drop the `image` field and placeholder-URL suggestions from the improvement set. */
function filterImprovements(improvements: RawImprovement[]): RawImprovement[] {
  return improvements.filter(
    (f) =>
      f.field !== "image" &&
      !(typeof f.suggestion === "string" && PLACEHOLDER_PATTERNS.test(f.suggestion)),
  );
}

const events = (raw: unknown): RefineAiEvent[] => raw as unknown as RefineAiEvent[];

// ── Ingredient ───────────────────────────────────────────────────────────────

async function runIngredientRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  const { metaRef, payload, missingFields, target, locale, store, eventLog, config } = input;
  const existingMeta = input.existingMeta ?? {};
  const isPerField = target !== undefined;

  const entityRef = metaRefToEntityRef(metaRef);
  const existingEvents = await eventLog.read(entityRef);

  // Inventory feeds the cross-collection candidate set for the pairings
  // proposer; per-field runs target exactly what the client asked for and
  // skip it entirely.
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
  const extraTargetFields = isPerField
    ? []
    : [...(inventory.length ? ["pairings"] : []), ...(!existingMeta["locale"] ? ["language"] : [])];

  return runRefresh(
    {
      contract: ingredientContract,
      currentData: payload as never,
      sourceContext: { inventory, locale },
      events: events(existingEvents),
      logger: aiLogger.child({ kind: "ingredient", slug: metaRef.slug }),
      extraTargetFields,
      assemble: async ({ suggestions, autoApplied, rawImprovements, errors }) => {
        const ingredientErrors = [...errors.values()].map((e) => ({
          field: e.field,
          message: e.message,
        }));
        const filteredImprovements = filterImprovements(rawImprovements);

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

        let autoLinked = 0;
        if (proposedPairings.length > 0) {
          const existingPairings = await store.list("pairings");
          const existingIds = new Set(existingPairings.map((p) => p.id));
          const plan = planPairingAutoApply(
            metaRef.slug,
            "ingredients",
            proposedPairings,
            existingIds,
          );
          const runId = getCurrentOrigin()?.runId;
          for (const action of plan) {
            await store.put("pairings", action.id, {
              endpoints: action.endpoints as [EndpointRef, EndpointRef],
              description: action.rationale,
            });
            await eventLog.append(entityRef, {
              type: "auto-applied",
              field: "pairings",
              suggestion: {
                hash: hashSuggestion({ slug: metaRef.slug, pairingSlug: action.otherSlug }),
                summary: `Pairing auto-applied: ${metaRef.slug} ↔ ${action.otherSlug}`,
              },
              model: config.model,
              confidence: action.confidence as Confidence,
              traceId: runId ?? pairingsTraceId,
            });
            autoLinked++;
          }
        }

        return { aiSuggestions, autoLinked, skipped: false, errors: ingredientErrors };
      },
    },
    { baseFields: fieldsForAi, isPerField, config, runField: runRefine },
  );
}

// ── Recipe ───────────────────────────────────────────────────────────────────

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
  } = input;
  const meta = input.existingMeta ?? {};
  const isPerField = target !== undefined;
  const entityRef = metaRefToEntityRef(metaRef);

  // Fingerprint short-circuit before any inventory work: a cache hit returns
  // the stored suggestion without touching the store or the LLM.
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
  const hasPairableEntities = inventory.length > 0 || existingRecipes.length > 0;
  const extraTargetFields = isPerField
    ? []
    : [
        "keywords",
        ...(recipeIngredients.length ? ["ingredientLinks"] : []),
        ...(existingRecipes.length ? ["relations"] : []),
        ...(hasPairableEntities ? ["pairings"] : []),
        ...(!meta["language"] ? ["language"] : []),
      ];

  return withProgress("refine", () =>
    runRefresh(
      {
        contract: recipeContract,
        currentData: payload as never,
        sourceContext: { inventory, existingTags: [], existingRecipes, locale },
        events: events(existingEvents),
        logger: aiLogger.child({ kind: "recipe", slug: metaRef.slug }),
        extraTargetFields,
        assemble: async ({ suggestions, autoApplied, rawImprovements, errors }) => {
          const recipeErrors = [...errors.values()].map((e) => ({
            field: e.field,
            message: e.message,
          }));
          const filteredImprovements = filterImprovements(rawImprovements);

          const tags: string[] = [];

          const linksSugg = suggestions.get("ingredientLinks");
          const ingredientLinks =
            linksSugg?.kind === "single"
              ? (linksSugg.value as Array<{
                  pattern: string;
                  slug: string;
                  confidence: Confidence;
                }>)
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
          // Per-field runs never auto-apply: persistence happens on the user's save.
          const toAutoApply = isPerField
            ? []
            : planLinkAutoApply(ingredientLinks, existingPatterns);

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
                confidence: link.confidence as Confidence,
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

          // Per-field runs do not persist the meta sidecar — writing to disk
          // would trip Astro's content watcher and wipe the just-arrived
          // suggestion from the client's form state.
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
        },
      },
      { baseFields: fieldsForAi, isPerField, config, runField: runRefine },
    ),
  );
}

// ── Pairing ──────────────────────────────────────────────────────────────────

async function runPairingRefresh(input: AiRefreshInput): Promise<AiRefreshResult> {
  const { metaRef, payload, target, locale, eventLog, config } = input;
  const isPerField = target !== undefined;
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

  return runRefresh(
    {
      contract: pairingContract,
      currentData: {
        description,
        ingredients: [refSlug(ings?.[0]), refSlug(ings?.[1])],
      } as never,
      sourceContext: { locale },
      events: events(existingEvents),
      logger: aiLogger.child({ kind: "pairing", slug: metaRef.slug }),
      extraTargetFields: [],
      assemble: async ({ suggestions, errors }) => {
        const pairingErrors = [...errors.values()].map((e) => ({
          field: e.field,
          message: e.message,
        }));

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
      },
    },
    { baseFields: isPerField ? target : ["description"], isPerField, config, runField: runRefine },
  );
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
