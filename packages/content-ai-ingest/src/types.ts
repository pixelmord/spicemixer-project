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

export interface MessageSet {
  messages?: ModelMessage[];
  prompt?: string;
  warnings?: string[];
}

// ── SiblingLocaleSource ───────────────────────────────────────────────────────

export interface SiblingLocaleSource<S extends ZodSchema = ZodSchema> {
  kind: "sibling-locale";
  sourceRef: EntityRef;
  sourceData: z.infer<S>;
  sourceLocale: string;
  targetLocale: string;
  fieldHashes: Record<string, string>;
}

// ── IngestContract ────────────────────────────────────────────────────────────

export interface IngestContract<S extends ZodSchema, Source> {
  schema: S;
  systemPrompt: string;
  buildMessages: (sourceContext: Source) => Promise<MessageSet>;
  fieldPolicies?: Partial<Record<string, FieldWritePolicy>>;
  fieldConfigs?: Record<string, { translation?: TranslationBehavior }>;
}

// ── FieldSuggestion ───────────────────────────────────────────────────────────

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

export interface AppliedSuggestion {
  value: unknown;
  hash: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

// ── IngestTraceSummary ─────────────────────────────────────────────────────────
// Core's TraceSummary plus the ingest-only merge prompt recorded on sibling-locale
// fills. mergeInstruction is genuinely ingest-specific, so it extends rather than
// pollutes the shared core type.

export interface IngestTraceSummary extends TraceSummary {
  mergeInstruction?: string;
}

// ── Minimal AiEvent shape for ingestedEvent ──────────────────────────────────

export interface IngestAiEvent {
  type: "ingested";
  at: string;
  model: string;
  suggestion: { hash: string; summary: string };
  traceId?: string;
  source?: string | SourceDescriptor;
}

// ── RunFill params/result ─────────────────────────────────────────────────────

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

export interface RunFillResult {
  suggestions: Map<string, FieldSuggestion>;
  autoApplied: Map<string, AppliedSuggestion>;
  traces: Map<string, IngestTraceSummary>;
  ingestedEvent: IngestAiEvent;
  warnings: string[];
}
