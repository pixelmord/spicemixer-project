import type { ZodSchema, z } from "zod";
import type { Origin } from "./origin.ts";
import type { FieldWritePolicy } from "./suggestions.ts";

export type TranslationBehavior =
  | { mode: "translate" }
  | { mode: "copy" }
  | { mode: "localize"; instruction?: string }
  | { mode: "skip" };

export type AutoApplyPolicy =
  | { policy: "never" }
  | { policy: "high-confidence"; threshold: number };

export type FieldPath<S extends ZodSchema> = keyof z.infer<S> & string;

export interface ResolvedPreset {
  id: string;
  label: string;
  description?: string;
  instruction: string;
  appliesTo: "text" | "array" | "enum" | "all";
  autoApplyOverride?: AutoApplyPolicy;
}

export interface RejectedSuggestion {
  fieldPath: string;
  summary: string;
  at: string;
  reason?: string;
}

// The single contract-side prompt context. Fields beyond `currentData` /
// `sourceContext` / `userPrompt` / `preset` are optional so the field runner
// (which only has those four) and richer callers (which also supply field,
// rejectedSuggestions, origin) both satisfy it — this is what lets
// content-ai-refine re-export these types instead of keeping a divergent copy.
//
// `currentData` is a `Partial` of the entity shape: callers routinely refine
// against a subset of fields (e.g. just `{ name }` for slug suggestion), and
// prompt builders already read each field defensively. This keeps those subset
// call sites cast-free; dynamic JSON payloads (`Record<string, unknown>` read
// from disk) still need an explicit cast since their shape isn't statically known.
export interface PromptContext<S extends ZodSchema, Source = never> {
  field?: FieldPath<S>;
  currentData?: Partial<z.infer<S>>;
  sourceContext?: Source;
  preset?: string | ResolvedPreset;
  userPrompt?: string;
  rejectedSuggestions?: RejectedSuggestion[];
  origin?: Origin;
}

export interface Preset<S extends ZodSchema = ZodSchema, Source = never> {
  id: string;
  label: string;
  description?: string;
  instruction: string | ((ctx: PromptContext<S, Source>) => string);
  appliesTo: "text" | "array" | "enum" | "all";
  autoApplyOverride?: AutoApplyPolicy;
}

// All AI fields are optional so contracts that only set translation
// continue to typecheck during the migration to full field configs.
export interface FieldConfig<S extends ZodSchema = ZodSchema, Source = never> {
  systemPrompt?: (ctx: PromptContext<S, Source>) => string;
  // Custom schema for LLM structured output. When omitted, the runner extracts
  // the field's schema from the entity schema. Use when the LLM output shape
  // differs from the stored entity shape (e.g. includes a confidence score).
  outputSchema?: ZodSchema;
  autoApply?: AutoApplyPolicy | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy);
  presetIds?: string[];
  writePolicy?: FieldWritePolicy<unknown>;
  translation?: TranslationBehavior;
  // When true, this field is attempted on every all-fields ("bulk") refresh,
  // not only when it is among the missing recommended fields. This is the
  // single source of truth for which enrichment fields a full run produces —
  // the runner derives its bulk target from the contract rather than a
  // hand-maintained per-entity list. Fields whose `systemPrompt` returns ""
  // for the current context are skipped by the runner, so preconditions
  // (e.g. "no inventory → no pairings") belong in the prompt, not here.
  bulk?: boolean;
}

export interface AiContract<S extends ZodSchema, Source = never> {
  schema: S;
  presets: Preset<S, Source>[];
  fields: Record<string, FieldConfig<S, Source>>;
}
