import type { AiEvent } from "./events.ts";

/**
 * Whether `(field, hash)` was previously rejected for this entity — i.e. the
 * log has a `rejected` event with the same field and content hash. The runner
 * checks this to drop re-proposed identical suggestions.
 */
export function isSuppressed(events: AiEvent[], field: string, hash: string): boolean {
  return events.some(
    (e) => e.type === "rejected" && e.field === field && e.suggestion.hash === hash,
  );
}

/** Drop any suggestions whose `(field, hash)` is {@link isSuppressed}. */
export function filterSuggestions<T extends { field: string; hash: string }>(
  events: AiEvent[],
  suggestions: T[],
): T[] {
  return suggestions.filter((s) => !isSuppressed(events, s.field, s.hash));
}

/**
 * Render the entity's `rejected` history as a prompt-injection block so the
 * model can avoid re-proposing what a human already turned down. Returns `""`
 * when nothing has been rejected.
 */
export function buildRejectedContext(events: AiEvent[]): string {
  const rejected = events.filter((e) => e.type === "rejected");
  if (rejected.length === 0) return "";
  const lines = rejected.map((e) => `- [${e.field ?? "entity"}] ${e.suggestion.summary}`);
  return `Previously rejected for this entity:\n${lines.join("\n")}`;
}
