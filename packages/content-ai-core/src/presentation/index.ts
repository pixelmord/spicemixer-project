import type { FieldSuggestion } from "../suggestions.ts";

/**
 * Human-readable one-liner for a {@link FieldSuggestion}: the stored `summary`
 * for a single value, or a "N candidates (pick …)" line for a choice.
 */
export function summarizeSuggestion(suggestion: FieldSuggestion): string {
  if (suggestion.kind === "single") {
    return suggestion.summary;
  }
  const count = suggestion.candidates.length;
  const choose = suggestion.choose;
  const pickLabel =
    typeof choose === "number" ? `pick ${choose}` : `pick ${choose.min}–${choose.max}`;
  return `${count} candidates (${pickLabel})`;
}

/** Title-case a confidence level for display ("high" → "High"). */
export function formatConfidence(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

/** Convert a runner's `suggestions` Map into a plain field-keyed object for rendering. */
export function groupSuggestionsByField(
  suggestions: Map<string, FieldSuggestion>,
): Record<string, FieldSuggestion> {
  return Object.fromEntries(suggestions.entries());
}
