import type { AiEvent, AiEventLog, EntityRef } from "../events.ts";
import type { TraceEvent, TraceSink } from "../trace.ts";
import { isSuppressed } from "../suppression.ts";
import { prune } from "../events.ts";

export { createMockLanguageModel, synthesizeFromJsonSchema } from "./mock-model.ts";

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

/**
 * In-memory {@link AiEventLog} for tests. Serialises appends per-ref (matching
 * the production locking contract) and adds test helpers: {@link InMemoryAiEventLog.seed | seed},
 * {@link InMemoryAiEventLog.clear | clear}, {@link InMemoryAiEventLog.all | all}.
 * Never use in production — state is lost on restart.
 */
export class InMemoryAiEventLog implements AiEventLog {
  #store = new Map<string, AiEvent[]>();
  #pending = new Map<string, Promise<void>>();

  async read(ref: EntityRef): Promise<AiEvent[]> {
    return this.#store.get(refKey(ref)) ?? [];
  }

  append(ref: EntityRef, event: Omit<AiEvent, "at" | "id">): Promise<void> {
    const key = refKey(ref);
    const prev = this.#pending.get(key) ?? Promise.resolve();
    const next = prev.then(() => this.#doAppend(ref, event));
    const tracked = next.finally(() => {
      if (this.#pending.get(key) === tracked) this.#pending.delete(key);
    });
    this.#pending.set(key, tracked);
    return next;
  }

  async #doAppend(ref: EntityRef, event: Omit<AiEvent, "at" | "id">): Promise<void> {
    const key = refKey(ref);
    const current = this.#store.get(key) ?? [];
    const stamped: AiEvent = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() };
    this.#store.set(key, prune([...current, stamped]));
  }

  /** Returns true if a rejected event exists for this exact (fieldPath, hash) pair. */
  async shouldSkip(ref: EntityRef, input: { fieldPath: string; hash: string }): Promise<boolean> {
    const events = await this.read(ref);
    return isSuppressed(events, input.fieldPath, input.hash);
  }

  /** Returns structured rejected-event context for building prompt injections. */
  async buildRejectedContext(
    ref: EntityRef,
  ): Promise<Array<{ fieldPath: string; summary: string; at: string; reason?: string }>> {
    const events = await this.read(ref);
    return events
      .filter((e) => e.type === "rejected")
      .map((e) => ({ fieldPath: e.field ?? "entity", summary: e.suggestion.summary, at: e.at }));
  }

  /** Test helper: insert a pre-built event without stamping a new timestamp. */
  async seed(ref: EntityRef, event: AiEvent): Promise<void> {
    const key = refKey(ref);
    const current = this.#store.get(key) ?? [];
    this.#store.set(key, [...current, event]);
  }

  /** Test helper: remove all events for a ref, or clear all refs when called without args. */
  clear(ref?: EntityRef): void {
    if (ref) {
      this.#store.delete(refKey(ref));
    } else {
      this.#store.clear();
      this.#pending.clear();
    }
  }

  /** Test helper: return all events across all refs. */
  all(): AiEvent[] {
    return [...this.#store.values()].flat();
  }
}

/**
 * In-memory {@link TraceSink} for tests: collects emitted {@link TraceEvent}s
 * on `.events` for assertions, with `.clear()` to reset.
 */
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
