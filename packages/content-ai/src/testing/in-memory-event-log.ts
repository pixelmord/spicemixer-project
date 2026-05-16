import type { AiEventLog, MetaRef } from "../event-log.ts";
import type { AiEvent } from "../schemas/ai-events.ts";
import { isSuppressed, recordAiEvent } from "../events.ts";

function refKey(ref: MetaRef): string {
  return `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
}

/**
 * In-memory AiEventLog implementation for use in tests.
 * Satisfies the same concurrency contract as SidecarEventLog:
 * appends for the same ref are serialised via a promise-chain map.
 */
export class InMemoryAiEventLog implements AiEventLog {
  #store = new Map<string, AiEvent[]>();
  #pending = new Map<string, Promise<void>>();

  async read(ref: MetaRef): Promise<AiEvent[]> {
    return this.#store.get(refKey(ref)) ?? [];
  }

  append(ref: MetaRef, event: Omit<AiEvent, "at">): Promise<void> {
    const key = refKey(ref);
    const prev = this.#pending.get(key) ?? Promise.resolve();
    const next = prev.then(() => this.#doAppend(ref, event));
    const tracked = next.finally(() => {
      if (this.#pending.get(key) === tracked) this.#pending.delete(key);
    });
    this.#pending.set(key, tracked);
    return next;
  }

  async #doAppend(ref: MetaRef, event: Omit<AiEvent, "at">): Promise<void> {
    const key = refKey(ref);
    const current = this.#store.get(key) ?? [];
    this.#store.set(key, recordAiEvent(current, event));
  }

  async shouldSkip(ref: MetaRef, input: { fieldPath: string; hash: string }): Promise<boolean> {
    const events = await this.read(ref);
    return isSuppressed(events, input.fieldPath, input.hash);
  }

  async buildRejectedContext(
    ref: MetaRef,
  ): Promise<Array<{ fieldPath: string; summary: string; at: string; reason?: string }>> {
    const events = await this.read(ref);
    return events
      .filter((e) => e.type === "rejected")
      .map((e) => ({ fieldPath: e.field ?? "entity", summary: e.suggestion.summary, at: e.at }));
  }

  /** Test helper: insert a pre-built event without stamping a new timestamp. */
  async seed(ref: MetaRef, event: AiEvent): Promise<void> {
    const key = refKey(ref);
    const current = this.#store.get(key) ?? [];
    this.#store.set(key, [...current, event]);
  }

  /** Test helper: remove all events for a ref. */
  clear(ref: MetaRef): void {
    this.#store.delete(refKey(ref));
  }
}
