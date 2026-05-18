import type { AiEvent } from "./schemas/ai-events.ts";

const MAX_EVENTS = 100;

// rejected and ingested are never prunable — ADR 0004 "never re-surface rejected" invariant.
export function isPrunable(event: AiEvent): boolean {
  return event.type !== "rejected" && event.type !== "ingested";
}

// Priority: oldest auto-applied pruned first, then oldest accepted. Rejected/ingested are never pruned.
export function planPrune(events: AiEvent[], capHint = MAX_EVENTS): AiEvent[] {
  if (events.length <= capHint) return events;

  const excess = events.length - capHint;

  const autoApplied = events
    .filter((e) => e.type === "auto-applied")
    .sort((a, b) => a.at.localeCompare(b.at));
  const accepted = events
    .filter((e) => e.type === "accepted")
    .sort((a, b) => a.at.localeCompare(b.at));

  const removeSet = new Set([...autoApplied, ...accepted].slice(0, excess));
  return events.filter((e) => !removeSet.has(e));
}

export function prune(events: AiEvent[]): AiEvent[] {
  return planPrune(events, MAX_EVENTS);
}

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

export function appendEvent<M extends { aiEvents?: AiEvent[] }>(
  meta: M,
  event: AiEvent,
): M & { aiEvents: AiEvent[] } {
  const current = meta.aiEvents ?? [];
  return { ...meta, aiEvents: prune([...current, event]) } as M & { aiEvents: AiEvent[] };
}

// Caller is responsible for persisting the returned array.
export function recordAiEvent(events: AiEvent[], params: Omit<AiEvent, "at" | "id">): AiEvent[] {
  return prune([...events, { ...params, id: crypto.randomUUID(), at: new Date().toISOString() }]);
}

export function hasAutoApplied(events: AiEvent[], field: string): boolean {
  return events.some((e) => e.type === "auto-applied" && e.field === field);
}

export function buildRejectedContext(events: AiEvent[]): string {
  const rejected = events.filter((e) => e.type === "rejected");
  if (rejected.length === 0) return "";
  const lines = rejected.map((e) => `- [${e.field ?? "entity"}] ${e.suggestion.summary}`);
  return `Previously rejected for this entity:\n${lines.join("\n")}`;
}
