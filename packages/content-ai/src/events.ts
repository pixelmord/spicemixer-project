import type { AiEvent } from "./schemas/ai-events.ts";

const MAX_EVENTS = 100;

/**
 * Prunes the event log down to MAX_EVENTS using priority order:
 * oldest "auto-applied" removed first, then oldest "accepted".
 * "rejected" and "ingested" events are never pruned.
 */
export function prune(events: AiEvent[]): AiEvent[] {
  if (events.length <= MAX_EVENTS) return events;

  const excess = events.length - MAX_EVENTS;

  const autoApplied = events
    .filter((e) => e.type === "auto-applied")
    .sort((a, b) => a.at.localeCompare(b.at));
  const accepted = events
    .filter((e) => e.type === "accepted")
    .sort((a, b) => a.at.localeCompare(b.at));

  const removeSet = new Set([...autoApplied, ...accepted].slice(0, excess));
  return events.filter((e) => !removeSet.has(e));
}

/** Returns true if a "rejected" event exists for this exact (field, hash) pair. */
export function isSuppressed(events: AiEvent[], field: string, hash: string): boolean {
  return events.some(
    (e) => e.type === "rejected" && e.field === field && e.suggestion.hash === hash,
  );
}

/** Drops suggestions whose (field, hash) pair matches a rejected event. */
export function filterSuggestions<T extends { field: string; hash: string }>(
  events: AiEvent[],
  suggestions: T[],
): T[] {
  return suggestions.filter((s) => !isSuppressed(events, s.field, s.hash));
}

/** Pure helper: appends an event to meta and applies the pruner. */
export function appendEvent<M extends { aiEvents?: AiEvent[] }>(
  meta: M,
  event: AiEvent,
): M & { aiEvents: AiEvent[] } {
  const current = meta.aiEvents ?? [];
  return { ...meta, aiEvents: prune([...current, event]) } as M & { aiEvents: AiEvent[] };
}

/**
 * Records an AI event by appending to the log and pruning.
 * Returns the updated events array (caller is responsible for persisting).
 */
export function recordAiEvent(events: AiEvent[], params: Omit<AiEvent, "at">): AiEvent[] {
  return prune([...events, { ...params, at: new Date().toISOString() }]);
}
