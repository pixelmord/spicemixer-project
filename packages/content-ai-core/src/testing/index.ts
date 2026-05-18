import type { AiEvent, AiEventLog, EntityRef } from "../events.ts";
import type { TraceEvent, TraceSink } from "../trace.ts";

export { createMockLanguageModel, synthesizeFromJsonSchema } from "./mock-model.ts";

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

export class InMemoryAiEventLog implements AiEventLog {
  #store = new Map<string, AiEvent[]>();

  async read(ref: EntityRef): Promise<AiEvent[]> {
    return this.#store.get(refKey(ref)) ?? [];
  }

  async append(ref: EntityRef, event: Omit<AiEvent, "at" | "id">): Promise<void> {
    const key = refKey(ref);
    const existing = this.#store.get(key) ?? [];
    const stamped: AiEvent = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() };
    this.#store.set(key, [...existing, stamped]);
  }

  /** Clears all stored events. Useful for test isolation. */
  clear(): void {
    this.#store.clear();
  }

  /** Returns all events across all refs. Useful for assertions. */
  all(): AiEvent[] {
    return [...this.#store.values()].flat();
  }
}

export class InMemoryTraceSink implements TraceSink {
  #events: TraceEvent[] = [];

  emit(event: TraceEvent): void {
    this.#events.push(event);
  }

  get events(): TraceEvent[] {
    return this.#events;
  }

  clear(): void {
    this.#events = [];
  }
}
