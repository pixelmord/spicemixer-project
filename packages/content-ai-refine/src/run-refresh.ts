import type { ZodSchema, z } from "zod";
import type { Logger } from "@pixelmord/content-ai-core";
import type { TraceSink } from "@pixelmord/content-ai-core/server";
import { runRefine } from "./run-refine.ts";
import type {
  AiConfig,
  AiContract,
  AiEvent,
  AppliedSuggestion,
  FieldRunError,
  FieldSuggestion,
} from "./types.ts";

/**
 * One extracted suggestion for a refined field, before any app-specific
 * filtering. The kind-agnostic shape every consumer's `assemble` works from.
 */
export interface RawImprovement {
  field: string;
  suggestion: unknown;
  summary: string;
  hash: string | undefined;
  traceId: string;
  confidence: "high" | "medium" | "low" | undefined;
}

/**
 * Per-kind, per-call adapter at the refresh seam. Holds all stateful context
 * (current data, source context, events, side-effect I/O) so that `runRefresh`
 * itself never touches a content store or event log — keeping the runner
 * portable across consumers (ADR 0017).
 */
export interface RefreshStrategy<S extends ZodSchema, Source, Result> {
  contract: AiContract<S, Source>;
  currentData: Partial<z.infer<S>>;
  sourceContext?: Source;
  events?: AiEvent[];
  logger?: Logger;
  /** Build the kind-specific result; performs auto-apply side effects unless isPerField. */
  assemble: (args: {
    suggestions: Map<string, FieldSuggestion>;
    autoApplied: Map<string, AppliedSuggestion>;
    rawImprovements: RawImprovement[];
    errors: Map<string, FieldRunError>;
    isPerField: boolean;
  }) => Promise<Result>;
}

export type FieldRunner = typeof runRefine;

export interface RefreshRunParams {
  /** Fields the run targets: missing fields on a full run, or the explicit per-field set. */
  baseFields: string[];
  /** Per-field runs skip side-effect proposers and never auto-apply. */
  isPerField: boolean;
  config: AiConfig;
  sinks?: TraceSink[];
  /**
   * Field-level runner the orchestration drives. Defaults to `runRefine`.
   * Consumers may inject their own (or a test double) — keeping the LLM-call
   * collaborator an explicit seam rather than a hidden module import.
   */
  runField?: FieldRunner;
}

/** Extract one improvement per base field that produced a single-value suggestion. */
function extractImprovements(
  baseFields: string[],
  suggestions: Map<string, FieldSuggestion>,
): RawImprovement[] {
  return baseFields
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
}

/**
 * Drive a full AI refresh of one entity through the per-kind strategy:
 * optional cache short-circuit → compose target → runRefine → error-check →
 * extract raw improvements → delegate to assemble.
 */
export async function runRefresh<S extends ZodSchema, Source, Result>(
  strategy: RefreshStrategy<S, Source, Result>,
  params: RefreshRunParams,
): Promise<Result> {
  // On a full run, the target is the missing recommended fields (baseFields)
  // plus every field the contract flags `bulk: true` — the contract is the
  // single source of truth for which enrichment fields a full refresh runs.
  // Per-field runs target exactly what the caller asked for and skip bulk.
  const bulkFields = Object.entries(strategy.contract.fields)
    .filter(([, cfg]) => cfg.bulk)
    .map(([field]) => field);
  const target = params.isPerField
    ? params.baseFields
    : [...new Set([...params.baseFields, ...bulkFields])];

  const fieldRunner = params.runField ?? runRefine;
  const { suggestions, autoApplied, errors } = await fieldRunner({
    contract: strategy.contract,
    currentData: strategy.currentData,
    sourceContext: strategy.sourceContext,
    target,
    events: strategy.events,
    config: params.config,
    ...(strategy.logger ? { logger: strategy.logger } : {}),
    ...(params.sinks ? { sinks: params.sinks } : {}),
  });

  if (errors && errors.size > 0 && suggestions.size === 0 && autoApplied.size === 0) {
    const first = [...errors.values()][0];
    throw new Error(
      first ? `AI suggest failed for ${first.field}: ${first.message}` : "AI suggest failed",
    );
  }

  const rawImprovements = extractImprovements(params.baseFields, suggestions);
  return strategy.assemble({
    suggestions,
    autoApplied,
    rawImprovements,
    errors: errors ?? new Map(),
    isPerField: params.isPerField,
  });
}
