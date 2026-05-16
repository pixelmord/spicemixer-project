import type { ZodSchema, z } from "zod";
import type { FieldWritePolicy } from "./suggestions.ts";

export type TranslationBehavior =
  | { mode: "translate" }
  | { mode: "copy" }
  | { mode: "localize"; instruction?: string }
  | { mode: "skip" };

export type AutoApplyPolicy =
  | { policy: "never" }
  | { policy: "high-confidence"; threshold: number };

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

// All AI fields are optional so contracts that only set translation
// continue to typecheck during the migration to full field configs.
export interface FieldConfig<S extends ZodSchema = ZodSchema, Source = never> {
  systemPrompt?: (ctx: PromptContext<S, Source>) => string;
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
