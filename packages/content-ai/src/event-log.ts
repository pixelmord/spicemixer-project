import type { AiEvent } from "./schemas/ai-events.ts";
import { buildRejectedContext, isSuppressed, recordAiEvent } from "./events.ts";
import { hashContent } from "./hash.ts";

export type MetaRef = {
  collection: string;
  locale?: string;
  slug: string;
};

/**
 * Minimal sidecar interface the AiEventLog depends on. Satisfied by MetaSidecar
 * from the website app (structural/duck typing).
 */
export interface AiEventSidecar {
  read(ref: MetaRef): Promise<{ data: unknown } | null>;
  write(ref: MetaRef, data: unknown): Promise<void>;
}

export type FingerprintInputs = {
  recipe: unknown;
  missingFields: string[];
  locale: string;
  model: string;
};

export type SkipResult =
  | { skip: true; cachedSuggestion: Record<string, unknown>; fingerprint: string }
  | { skip: false; fingerprint: string; existingEvents: AiEvent[] };

/**
 * Public interface for the per-entity AI event log (ADR 0004).
 * All AI event interactions should flow through an AiEventLog instance.
 *
 * Concurrency contract: append is serialisable per entityRef — concurrent
 * appends for the same ref are queued so read-prune-write cycles cannot race.
 * Appends for different refs are independent and may run in parallel.
 */
export interface AiEventLog {
  read(ref: MetaRef): Promise<AiEvent[]>;
  /** Stamps `at` with the current ISO timestamp. */
  append(ref: MetaRef, event: Omit<AiEvent, "at">): Promise<void>;
  /** Returns true if a rejected event exists for this exact (fieldPath, hash) pair. */
  shouldSkip(ref: MetaRef, input: { fieldPath: string; hash: string }): Promise<boolean>;
  /** Returns structured rejected-event context for building prompt injections. */
  buildRejectedContext(
    ref: MetaRef,
  ): Promise<Array<{ fieldPath: string; summary: string; at: string; reason?: string }>>;
}

function refKey(ref: MetaRef): string {
  return `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
}

// Per-entity serialization map: value is the tail of the promise chain for that key.
// Allows concurrent appends across different entities while serialising within one.
const pendingAppends = new Map<string, Promise<void>>();

/** SidecarEventLog implements AiEventLog over an AiEventSidecar + fingerprint cache. */
export class SidecarEventLog implements AiEventLog {
  #sidecar: AiEventSidecar;

  constructor(sidecar: AiEventSidecar) {
    this.#sidecar = sidecar;
  }

  async #readMeta(ref: MetaRef): Promise<{ meta: Record<string, unknown>; events: AiEvent[] }> {
    const item = await this.#sidecar.read(ref);
    const meta = (item?.data as Record<string, unknown> | undefined) ?? {};
    const events: AiEvent[] = Array.isArray(meta["aiEvents"])
      ? (meta["aiEvents"] as AiEvent[])
      : [];
    return { meta, events };
  }

  async read(ref: MetaRef): Promise<AiEvent[]> {
    return (await this.#readMeta(ref)).events;
  }

  /**
   * Serialise appends per entity: chains onto the pending promise for this ref
   * so concurrent callers don't race on the same read-prune-write cycle.
   */
  append(ref: MetaRef, event: Omit<AiEvent, "at">): Promise<void> {
    const key = refKey(ref);
    const prev = pendingAppends.get(key) ?? Promise.resolve();
    const next = prev.then(() => this.#doAppend(ref, event));
    const tracked = next.finally(() => {
      if (pendingAppends.get(key) === tracked) pendingAppends.delete(key);
    });
    pendingAppends.set(key, tracked);
    return next;
  }

  async #doAppend(ref: MetaRef, event: Omit<AiEvent, "at">): Promise<void> {
    const { meta, events } = await this.#readMeta(ref);
    const updatedEvents = recordAiEvent(events, event);
    await this.#sidecar.write(ref, { ...meta, aiEvents: updatedEvents });
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

  /**
   * Fingerprint cache check — not on the AiEventLog interface; used by the recipe
   * runner to short-circuit repeated suggestion fetches when inputs haven't changed.
   * Rejected-event hashes are folded into the fingerprint so new rejections bust the cache.
   */
  async checkFingerprint(
    ref: MetaRef,
    inputs: FingerprintInputs,
    force = false,
  ): Promise<SkipResult> {
    const { meta, events: existingEvents } = await this.#readMeta(ref);

    const rejectedHashes = existingEvents
      .filter((e) => e.type === "rejected")
      .map((e) => `${e.field ?? ""}:${e.suggestion.hash}`)
      .sort();

    const fingerprint = hashContent({
      recipe: inputs.recipe,
      missingFields: [...inputs.missingFields].sort(),
      locale: inputs.locale,
      model: inputs.model,
      rejectedHashes,
    });

    if (!force) {
      const cached = meta["aiSuggestions"] as
        | { fingerprint?: string; data?: Record<string, unknown> }
        | undefined;
      if (cached?.fingerprint === fingerprint && cached.data) {
        return { skip: true, cachedSuggestion: cached.data, fingerprint };
      }
    }

    return { skip: false, fingerprint, existingEvents };
  }

  /** Convenience: build the string rejected-context used by proposer prompts. */
  buildRejectedContextString(events: AiEvent[]): string {
    return buildRejectedContext(events);
  }
}

export function createAiEventLog(sidecar: AiEventSidecar): SidecarEventLog {
  return new SidecarEventLog(sidecar);
}
