import type { AiEventLog, EntityRef } from "@pixelmord/content-ai-core";
import type { AiEvent } from "../schemas/ai-events.ts";
import { isSuppressed, prune } from "../events.ts";

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

/**
 * In-memory AiEventLog implementation for use in tests.
 * Satisfies the same concurrency contract as SidecarEventLog:
 * appends for the same ref are serialised via a promise-chain map.
 * Core stamps at and id on every persisted event.
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

  /** Test helper: remove all events for a ref. */
  clear(ref: EntityRef): void {
    this.#store.delete(refKey(ref));
  }
}
