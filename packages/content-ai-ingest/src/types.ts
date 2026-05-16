import type { ZodSchema, z } from "zod";
import type { ModelMessage } from "ai";

// ── AiConfig ─────────────────────────────────────────────────────────────────

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// ── Source-context message set ─────────────────────────────────────────────────

export interface MessageSet {
  messages?: ModelMessage[];
  prompt?: string;
  warnings?: string[];
}

// ── FieldWritePolicy ─────────────────────────────────────────────────────────

export type FieldWritePolicy<T = unknown> =
  | "preserve"
  | "replace"
  | "fill-if-empty"
  | { mode: "merge-function"; merge: (current: T, proposed: T) => T }
  | { mode: "merge-instructions"; instruction: string };

// ── TranslationBehavior ───────────────────────────────────────────────────────

export type TranslationBehavior =
  | { mode: "translate" }
  | { mode: "copy" }
  | { mode: "localize"; instruction?: string }
  | { mode: "skip" };

// ── EntityRef ─────────────────────────────────────────────────────────────────

export interface EntityRef {
  id: string;
  kind: string;
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

// ── TraceSummary ──────────────────────────────────────────────────────────────

export interface TraceSummary {
  traceId: string;
  model: string;
  runtimeMs: number;
  preset?: string;
  userPrompt?: string;
  confidence?: "high" | "medium" | "low";
}

// ── Minimal AiEvent shape for ingestedEvent ──────────────────────────────────

export interface IngestAiEvent {
  type: "ingested";
  at: string;
  model: string;
  suggestion: { hash: string; summary: string };
  traceId?: string;
}

// ── RunFill params/result ─────────────────────────────────────────────────────

export interface RunFillParams<S extends ZodSchema, Source> {
  contract: IngestContract<S, Source>;
  sourceContext: Source;
  config: AiConfig;
  currentData?: Record<string, unknown>;
  preset?: string;
  userPrompt?: string;
  writePolicy?: FieldWritePolicy;
  fieldPolicies?: Record<string, FieldWritePolicy>;
}

export interface RunFillResult {
  suggestions: Map<string, FieldSuggestion>;
  autoApplied: Map<string, AppliedSuggestion>;
  traces: Map<string, TraceSummary>;
  ingestedEvent: IngestAiEvent;
  warnings: string[];
}
