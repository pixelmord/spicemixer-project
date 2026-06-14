import type { ZodSchema, z } from "zod";
import type { ModelMessage } from "ai";
import type {
  AiConfig,
  EntityRef,
  FieldWritePolicy,
  Logger,
  SourceDescriptor,
  TraceSummary,
  TranslationBehavior,
} from "@pixelmord/content-ai-core";
import type { TraceSink } from "@pixelmord/content-ai-core/server";

export type { AiConfig, EntityRef, FieldWritePolicy, TranslationBehavior };

// ── Source-context message set ─────────────────────────────────────────────────

/**
 * The model messages a {@link IngestContract.buildMessages} call produces for a
 * source: either prebuilt `messages` (e.g. multimodal PDF/image parts) or a
 * plain `prompt` string, plus any `warnings` to surface (e.g. truncation).
 */
export interface MessageSet {
  messages?: ModelMessage[];
  prompt?: string;
  warnings?: string[];
}

/**
 * Source context for a translation fill: an existing sibling-locale entity to
 * generate the target locale from. `runFill` blends `sourceData` into the
 * target language; `fieldHashes` lets the caller detect which source fields
 * changed since the last sync.
 */
export interface SiblingLocaleSource<S extends ZodSchema = ZodSchema> {
  kind: "sibling-locale";
  sourceRef: EntityRef;
  sourceData: z.infer<S>;
  sourceLocale: string;
  targetLocale: string;
  fieldHashes: Record<string, string>;
}

/**
 * Describes how to fill one entity kind from an external source. The
 * source-driven analogue of an `AiContract`: a Zod `schema`, a `systemPrompt`,
 * and `buildMessages` to turn the source context into model input. Optional
 * `fieldPolicies`/`fieldConfigs` set per-field write and translation behavior.
 *
 * @typeParam S - The entity's Zod schema.
 * @typeParam Source - The source-context type (extracted artifact, or a
 * {@link SiblingLocaleSource} for translation).
 */
export interface IngestContract<S extends ZodSchema, Source> {
  schema: S;
  systemPrompt: string;
  buildMessages: (sourceContext: Source) => Promise<MessageSet>;
  fieldPolicies?: Partial<Record<string, FieldWritePolicy>>;
  fieldConfigs?: Record<string, { translation?: TranslationBehavior }>;
}

// ── FieldSuggestion ───────────────────────────────────────────────────────────

/** A model proposal for one filled field, awaiting review. See core's `FieldSuggestion`. */
export type FieldSuggestion<T = unknown> =
  | {
      kind: "single";
      value: T;
      confidence: "high" | "medium" | "low";
      summary: string;
      hash: string;
      traceId: string;
    }
  | {
      kind: "choice";
      candidates: Array<{
        value: T;
        summary: string;
        hash: string;
        confidence?: "high" | "medium" | "low";
      }>;
      choose: 1 | { min: number; max: number };
      traceId: string;
    };

// ── AppliedSuggestion ─────────────────────────────────────────────────────────

/** A suggestion the runner auto-applied rather than queuing. See core's `AppliedSuggestion`. */
export interface AppliedSuggestion {
  value: unknown;
  hash: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Core's {@link TraceSummary} plus the ingest-only `mergeInstruction` recorded
 * on sibling-locale fills. Extends rather than pollutes the shared core type.
 */
export interface IngestTraceSummary extends TraceSummary {
  mergeInstruction?: string;
}

/**
 * The `ingested` event `runFill` returns for the caller to persist — records
 * the source attribution (hash, summary, model, optional {@link SourceDescriptor})
 * for the fill. Append it to the entity's event log.
 */
export interface IngestAiEvent {
  type: "ingested";
  at: string;
  model: string;
  suggestion: { hash: string; summary: string };
  traceId?: string;
  source?: string | SourceDescriptor;
}

// ── RunFill params/result ─────────────────────────────────────────────────────

/**
 * Arguments to {@link runFill}: the {@link IngestContract}, the `sourceContext`
 * to fill from, provider `config`, and optional review/trace controls. Existing
 * `currentData` plus `writePolicy`/`fieldPolicies` govern whether a filled field
 * overwrites an existing value.
 */
export interface RunFillParams<S extends ZodSchema, Source> {
  contract: IngestContract<S, Source>;
  sourceContext: Source;
  config: AiConfig;
  sinks?: TraceSink[];
  currentData?: Record<string, unknown>;
  preset?: string;
  userPrompt?: string;
  writePolicy?: FieldWritePolicy;
  fieldPolicies?: Record<string, FieldWritePolicy>;
  /**
   * Optional structural logger (pino-compatible). When omitted, no-op.
   * Logs LLM call lifecycle, message warnings, and errors.
   */
  logger?: Logger;
  /**
   * When set on a sibling-locale source run, this string is prepended to the
   * per-field user-message so the LLM can blend new content with existing
   * target-language text. Silently ignored for non-sibling-locale source kinds.
   * Use the exported MERGE_INSTRUCTION constant for consistent trace events.
   */
  mergeInstruction?: string;
}

/**
 * Result of {@link runFill}: `suggestions` to review and `autoApplied` writes
 * (both keyed by field), per-call `traces`, the `ingestedEvent` to persist, and
 * any `warnings` accumulated while building messages.
 */
export interface RunFillResult {
  suggestions: Map<string, FieldSuggestion>;
  autoApplied: Map<string, AppliedSuggestion>;
  traces: Map<string, IngestTraceSummary>;
  ingestedEvent: IngestAiEvent;
  warnings: string[];
}
