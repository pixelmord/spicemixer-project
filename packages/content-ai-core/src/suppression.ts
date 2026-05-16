import type { AiEvent } from "./events.ts";

export function isSuppressed(events: AiEvent[], field: string, hash: string): boolean {
  return events.some(
    (e) => e.type === "rejected" && e.field === field && e.suggestion.hash === hash,
  );
}

export function filterSuggestions<T extends { field: string; hash: string }>(
  events: AiEvent[],
  suggestions: T[],
): T[] {
  return suggestions.filter((s) => !isSuppressed(events, s.field, s.hash));
}

export function buildRejectedContext(events: AiEvent[]): string {
  const rejected = events.filter((e) => e.type === "rejected");
  if (rejected.length === 0) return "";
  const lines = rejected.map((e) => `- [${e.field ?? "entity"}] ${e.suggestion.summary}`);
  return `Previously rejected for this entity:\n${lines.join("\n")}`;
}
