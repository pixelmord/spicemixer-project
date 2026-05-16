import type { FieldSuggestion } from "../suggestions.ts";

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

export function groupSuggestionsByField(
  suggestions: Map<string, FieldSuggestion>,
): Record<string, FieldSuggestion> {
  return Object.fromEntries(suggestions.entries());
}
