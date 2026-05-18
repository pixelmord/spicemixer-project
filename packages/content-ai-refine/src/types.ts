import type { ZodSchema, z } from "zod";
import type { TraceSink } from "@pixelmord/content-ai-core";
import type { AiConfig } from "./provider.ts";

// ── Re-export core types inline to avoid dist dependency ─────────────────────
// These mirror @pixelmord/content-ai-core types exactly.

export type { AiConfig };

export type TranslationBehavior =
  | { mode: "translate" }
  | { mode: "copy" }
  | { mode: "localize"; instruction?: string }
  | { mode: "skip" };

export type AutoApplyPolicy =
  | { policy: "never" }
  | { policy: "high-confidence"; threshold: number };

export type FieldWritePolicy<T = unknown> =
  | "preserve"
  | "replace"
  | "fill-if-empty"
  | { mode: "merge-function"; merge: (current: T, proposed: T) => T }
  | { mode: "merge-instructions"; instruction: string };

export interface PromptContext<S extends ZodSchema, Source> {
  currentData?: z.infer<S>;
  sourceContext?: Source;
  userPrompt?: string;
  preset?: string;
}

export interface Preset<S extends ZodSchema = ZodSchema, Source = never> {
  id: string;
  label: string;
  description?: string;
  instruction: string | ((ctx: PromptContext<S, Source>) => string);
  appliesTo: "text" | "array" | "enum" | "all";
  autoApplyOverride?: AutoApplyPolicy;
}

export interface FieldConfig<S extends ZodSchema = ZodSchema, Source = never> {
  systemPrompt?: (ctx: PromptContext<S, Source>) => string;
  outputSchema?: ZodSchema;
  autoApply?: AutoApplyPolicy | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy);
  presetIds?: string[];
  writePolicy?: FieldWritePolicy<unknown>;
  translation?: TranslationBehavior;
}

export interface AiContract<S extends ZodSchema, Source = never> {
  schema: S;
  presets: Preset<S, Source>[];
  fields: Record<string, FieldConfig<S, Source>>;
}

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
}

export interface RunRefineResult {
  suggestions: Map<string, FieldSuggestion>;
  autoApplied: Map<string, AppliedSuggestion>;
  traces: Map<string, TraceSummary>;
}
