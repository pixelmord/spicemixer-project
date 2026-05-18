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

export interface PromptContext<S extends ZodSchema, Source = never> {
  field: FieldPath<S>;
  currentData?: Partial<z.infer<S>>;
  sourceContext?: Source;
  preset?: ResolvedPreset;
  userPrompt?: string;
  rejectedSuggestions: Array<{
    fieldPath: string;
    summary: string;
    at: string;
    reason?: string;
  }>;
  origin: Origin;
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
}

export interface AiContract<S extends ZodSchema, Source = never> {
  schema: S;
  presets: Preset<S, Source>[];
  fields: Record<string, FieldConfig<S, Source>>;
}
