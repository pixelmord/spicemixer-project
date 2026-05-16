import type { ZodSchema, z } from "zod";
import type { FieldWritePolicy } from "./suggestions.ts";

// ── TranslationBehavior ───────────────────────────────────────────────────────
// Staged here; wired into the translation runner in PRD 10.

export type TranslationBehavior =
  | { mode: "translate" }
  | { mode: "copy" }
  | { mode: "localize"; instruction?: string }
  | { mode: "skip" };

// ── AutoApplyPolicy ───────────────────────────────────────────────────────────

export type AutoApplyPolicy =
  | { policy: "never" }
  | { policy: "high-confidence"; threshold: number };

// ── PromptContext ─────────────────────────────────────────────────────────────

export interface PromptContext<S extends ZodSchema, Source> {
  currentData?: z.infer<S>;
  sourceContext?: Source;
  userPrompt?: string;
  preset?: string;
}

// ── Preset ───────────────────────────────────────────────────────────────────

export interface Preset<S extends ZodSchema = ZodSchema, Source = never> {
  id: string;
  label: string;
  description?: string;
  instruction: string | ((ctx: PromptContext<S, Source>) => string);
  appliesTo: "text" | "array" | "enum" | "all";
  autoApplyOverride?: AutoApplyPolicy;
}

// ── FieldConfig ───────────────────────────────────────────────────────────────
// All AI fields are optional during the transition period (PRD 8 migration
// sequence step 2). Contracts that only set translation?: TranslationBehavior
// continue to typecheck.

export interface FieldConfig<S extends ZodSchema = ZodSchema, Source = never> {
  systemPrompt?: (ctx: PromptContext<S, Source>) => string;
  autoApply?: AutoApplyPolicy | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy);
  presetIds?: string[];
  writePolicy?: FieldWritePolicy<unknown>;
  translation?: TranslationBehavior;
}

// ── AiContract ────────────────────────────────────────────────────────────────

export interface AiContract<S extends ZodSchema, Source = never> {
  schema: S;
  presets: Preset<S, Source>[];
  fields: Record<string, FieldConfig<S, Source>>;
}
