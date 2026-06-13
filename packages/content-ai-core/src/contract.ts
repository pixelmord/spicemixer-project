import type { ZodSchema, z } from "zod";
import type { Origin } from "./origin.ts";
import type { FieldWritePolicy } from "./suggestions.ts";

/**
 * How a field behaves when an entity is translated into a sibling locale.
 *
 * - `translate` — re-generate the field in the target language (default).
 * - `copy` — carry the source value across verbatim (locale-invariant data).
 * - `localize` — adapt rather than translate, optionally with an `instruction`.
 * - `skip` — leave the field untouched in the target.
 *
 * @see {@link classifyRefreshKind} — `copy` fields refresh silently; everything
 * else requires review.
 */
export type TranslationBehavior =
  | { mode: "translate" }
  | { mode: "copy" }
  | { mode: "localize"; instruction?: string }
  | { mode: "skip" };

/**
 * Whether a suggestion may be written without human review (ADR 0004).
 *
 * - `never` — always surface as a pending suggestion.
 * - `high-confidence` — auto-apply when the model's self-reported confidence
 *   score meets or exceeds `threshold` (high=1.0, medium=0.5, low=0.0).
 */
export type AutoApplyPolicy =
  | { policy: "never" }
  | { policy: "high-confidence"; threshold: number };

/** A field name of the entity schema `S`, constrained to its string keys. */
export type FieldPath<S extends ZodSchema> = keyof z.infer<S> & string;

/**
 * A {@link Preset} with its `instruction` already resolved to a string for the
 * current context (presets may declare `instruction` as a function). This is
 * the shape passed around once a preset has been selected for a run.
 */
export interface ResolvedPreset {
  id: string;
  label: string;
  description?: string;
  instruction: string;
  appliesTo: "text" | "array" | "enum" | "all";
  autoApplyOverride?: AutoApplyPolicy;
}

/**
 * A previously rejected suggestion, surfaced into prompt context so the model
 * can avoid re-proposing it. Built from `rejected` events in the entity's log.
 */
export interface RejectedSuggestion {
  fieldPath: string;
  summary: string;
  at: string;
  reason?: string;
}

/**
 * The argument every prompt-building function on a contract receives. A
 * contract's `systemPrompt`, `autoApply`, and preset `instruction` callbacks
 * all read from this to decide what to ask the model and whether to gate the
 * field off (an empty `systemPrompt` result skips the field entirely).
 *
 * All fields beyond `currentData` / `sourceContext` / `userPrompt` / `preset`
 * are optional so both the field runner (which supplies only those four) and
 * richer callers (which also pass `field`, `rejectedSuggestions`, `origin`)
 * satisfy the same type — this is what lets content-ai-refine re-export these
 * types instead of keeping a divergent copy.
 *
 * `currentData` is a `Partial` of the entity shape: callers routinely refine a
 * subset of fields (e.g. just `{ name }` for a slug suggestion), and prompt
 * builders read each field defensively.
 *
 * @typeParam S - The entity's Zod schema.
 * @typeParam Source - The source-context type (e.g. extracted PDF text, a
 * sibling-locale entity); `never` when the contract has no external source.
 */
export interface PromptContext<S extends ZodSchema, Source = never> {
  field?: FieldPath<S>;
  currentData?: Partial<z.infer<S>>;
  sourceContext?: Source;
  preset?: string | ResolvedPreset;
  userPrompt?: string;
  rejectedSuggestions?: RejectedSuggestion[];
  origin?: Origin;
}

/**
 * A named, user-selectable refinement intent (e.g. "expand", "summarize").
 * A field opts into a preset via {@link FieldConfig.presetIds}; selecting the
 * preset on a run appends its `instruction` to the field's system prompt and,
 * if set, overrides the field's auto-apply policy.
 *
 * `instruction` may be a function so its text can depend on the current
 * {@link PromptContext}. `appliesTo` limits which field shapes a UI offers it for.
 */
export interface Preset<S extends ZodSchema = ZodSchema, Source = never> {
  id: string;
  label: string;
  description?: string;
  instruction: string | ((ctx: PromptContext<S, Source>) => string);
  appliesTo: "text" | "array" | "enum" | "all";
  autoApplyOverride?: AutoApplyPolicy;
}

/**
 * Per-field AI behavior. Every property is optional so a contract can declare,
 * say, only `translation` for a field and still typecheck.
 *
 * The runner reads this to decide, for each field: whether to call the model
 * (`systemPrompt` — returning `""` gates the field off), what JSON shape to ask
 * for (`outputSchema`, falling back to the field's slice of the entity schema),
 * whether the result may be written without review (`autoApply`), whether an
 * existing value blocks the write (`writePolicy`), and how the field behaves
 * under translation (`translation`).
 */
export interface FieldConfig<S extends ZodSchema = ZodSchema, Source = never> {
  /**
   * Builds the system prompt for this field. Returning an empty/whitespace
   * string gates the field off for the current context — the runner skips it
   * silently (e.g. "no inventory → no pairings"). Put preconditions here, not
   * in {@link FieldConfig.bulk}.
   */
  systemPrompt?: (ctx: PromptContext<S, Source>) => string;
  /**
   * Custom schema for the LLM's structured output. When omitted, the runner
   * extracts the field's schema from the entity schema. Use when the LLM output
   * shape differs from the stored entity shape.
   */
  outputSchema?: ZodSchema;
  /** Auto-apply policy for this field; may depend on the prompt context. */
  autoApply?: AutoApplyPolicy | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy);
  /** Ids of {@link Preset}s this field participates in. */
  presetIds?: string[];
  /** Whether an existing value blocks/merges the suggested write. */
  writePolicy?: FieldWritePolicy<unknown>;
  /** How this field behaves when the entity is translated. */
  translation?: TranslationBehavior;
  /**
   * When `true`, this field is attempted on every all-fields ("bulk") refresh,
   * not only when it is among the missing recommended fields. The contract is
   * thus the single source of truth for which enrichment fields a full run
   * produces — the runner derives its bulk target from here rather than a
   * hand-maintained per-entity list.
   */
  bulk?: boolean;
}

/**
 * The complete description of how AI fills and refines one entity kind. The
 * central object a consumer authors and passes to the runners: the Zod `schema`
 * defines the entity shape, `fields` configures per-field AI behavior, and
 * `presets` lists the refinement intents the UI can offer.
 *
 * @typeParam S - The entity's Zod schema.
 * @typeParam Source - The external source-context type, or `never` if none.
 */
export interface AiContract<S extends ZodSchema, Source = never> {
  schema: S;
  presets: Preset<S, Source>[];
  fields: Record<string, FieldConfig<S, Source>>;
}
