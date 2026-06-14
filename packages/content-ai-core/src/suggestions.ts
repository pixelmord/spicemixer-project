/**
 * How a suggested value interacts with an existing field value.
 *
 * - `preserve` — never overwrite; skip the field if it already has a value.
 * - `replace` — always overwrite.
 * - `fill-if-empty` — write only when the field is empty (default when current
 *   data is present).
 * - `merge-function` — combine current and proposed with a caller-supplied fn.
 * - `merge-instructions` — ask the model to blend the two, guided by text.
 */
export type FieldWritePolicy<T = unknown> =
  | "preserve"
  | "replace"
  | "fill-if-empty"
  | { mode: "merge-function"; merge: (current: T, proposed: T) => T }
  | { mode: "merge-instructions"; instruction: string };

/**
 * A model proposal for one field, awaiting review. Either a `single` value or a
 * `choice` of candidates the user picks from. Carries the self-reported
 * `confidence`, a human `summary`, the content `hash` (for dedup/suppression),
 * and the `traceId` of the LLM call that produced it.
 */
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

/**
 * A suggestion that the runner auto-applied (its confidence met the field's
 * {@link AutoApplyPolicy} threshold) rather than queuing for review. The
 * consumer writes `value` and records an `auto-applied` event.
 */
export interface AppliedSuggestion {
  value: unknown;
  hash: string;
  summary: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Metadata about a single LLM call, keyed by `traceId` in a runner's result.
 * Records the model, wall-clock `runtimeMs`, and which preset/prompt drove it —
 * enough to correlate a suggestion with its generation without the payload.
 */
export interface TraceSummary {
  traceId: string;
  model: string;
  runtimeMs: number;
  preset?: string;
  userPrompt?: string;
  confidence?: "high" | "medium" | "low";
}
