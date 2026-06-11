import type { ZodSchema, z } from "zod";
import type { Logger } from "@pixelmord/content-ai-core";
import type { TraceSink } from "@pixelmord/content-ai-core/server";
import type { AiConfig } from "./provider.ts";

export type { AiConfig };

// Contract types live in @pixelmord/content-ai-core (its stated responsibility)
// and are re-exported here so consumers can import them from the runtime
// package. There is one definition — no divergent inline copy to drift (the
// `bulk` flag bug came from exactly that duplication).
import type {
  AiContract,
  AutoApplyPolicy,
  FieldConfig,
  FieldWritePolicy,
  Preset,
  PromptContext,
  TranslationBehavior,
} from "@pixelmord/content-ai-core";

export type {
  AiContract,
  AutoApplyPolicy,
  FieldConfig,
  FieldWritePolicy,
  Preset,
  PromptContext,
  TranslationBehavior,
};

// ── Suggestion types ──────────────────────────────────────────────────────────

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

export interface AppliedSuggestion {
  value: unknown;
  hash: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

export interface TraceSummary {
  traceId: string;
  model: string;
  runtimeMs: number;
  preset?: string;
  userPrompt?: string;
  confidence?: "high" | "medium" | "low";
}

// ── AiEvent (minimal, for suppression filtering) ──────────────────────────────

export interface AiEvent {
  type: "auto-applied" | "accepted" | "rejected" | "ingested";
  field?: string;
  suggestion: { hash: string; summary: string };
  at: string;
  model: string;
  confidence?: "high" | "medium" | "low";
  reason?: string;
  traceId?: string;
}

// ── RunRefine params/result ───────────────────────────────────────────────────

export interface RunRefineParams<S extends ZodSchema, Source = never> {
  contract: AiContract<S, Source>;
  currentData: z.infer<S>;
  sourceContext?: Source;
  target?: string | string[];
  preset?: string;
  userPrompt?: string;
  config: AiConfig;
  sinks?: TraceSink[];
  events?: AiEvent[];
  /**
   * Optional structural logger (pino-compatible). When omitted, no-op.
   * Used to log per-field LLM calls, latency, and errors that would
   * otherwise be silently swallowed.
   */
  logger?: Logger;
  /**
   * How to handle per-field LLM errors.
   * - "collect" (default): record into `errors`, continue with other fields.
   * - "throw": re-throw the first per-field error so the caller can surface it
   *   (recommended for single-field runs from the editor).
   */
  errorMode?: "collect" | "throw";
}

export interface FieldRunError {
  field: string;
  message: string;
  name: string;
  cause?: unknown;
}

export interface RunRefineResult {
  suggestions: Map<string, FieldSuggestion>;
  autoApplied: Map<string, AppliedSuggestion>;
  traces: Map<string, TraceSummary>;
  /**
   * Per-field errors that occurred during refinement. Always populated by
   * runRefine (empty Map when no errors). Marked optional for back-compat
   * with test mocks that pre-date the field.
   */
  errors?: Map<string, FieldRunError>;
}
