import type { AiEvent, AiEventLog, EntityRef } from "@pixelmord/content-ai-core";
import { buildRejectedContext, isSuppressed, prune, hashContent } from "@pixelmord/content-ai-core";

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

export type { AiEventLog };

function metaRefKey(ref: MetaRef): string {
  return `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
}

/** Convert a canonical EntityRef to the Spicemixer-internal MetaRef. */
export function entityRefToMetaRef(ref: EntityRef): MetaRef {
  const slash = ref.id.indexOf("/");
  if (slash === -1) return { collection: ref.kind, slug: ref.id };
  return { collection: ref.kind, locale: ref.id.slice(0, slash), slug: ref.id.slice(slash + 1) };
}

/** Convert a Spicemixer-internal MetaRef to a canonical EntityRef. */
export function metaRefToEntityRef(ref: MetaRef): EntityRef {
  return { kind: ref.collection, id: ref.locale ? `${ref.locale}/${ref.slug}` : ref.slug };
}

// Per-entity serialization map: value is the tail of the promise chain for that key.
// Allows concurrent appends across different entities while serialising within one.
const pendingAppends = new Map<string, Promise<void>>();

/**
 * SidecarEventLog implements the canonical AiEventLog interface (EntityRef) over
 * an AiEventSidecar (MetaRef). The constructor accepts a MetaRef-shaped writer;
 * callers (the runner) pass EntityRef.
 */
export class SidecarEventLog implements AiEventLog {
  #sidecar: AiEventSidecar;

  constructor(sidecar: AiEventSidecar) {
    this.#sidecar = sidecar;
  }

  async #readMeta(metaRef: MetaRef): Promise<{ meta: Record<string, unknown>; events: AiEvent[] }> {
    const item = await this.#sidecar.read(metaRef);
    const meta = (item?.data as Record<string, unknown> | undefined) ?? {};
    const events: AiEvent[] = Array.isArray(meta["aiEvents"])
      ? (meta["aiEvents"] as AiEvent[])
      : [];
    return { meta, events };
  }

  async read(ref: EntityRef): Promise<AiEvent[]> {
    return (await this.#readMeta(entityRefToMetaRef(ref))).events;
  }

  /**
   * Serialise appends per entity: chains onto the pending promise for this ref
   * so concurrent callers don't race on the same read-prune-write cycle.
   * Core stamps `at` and `id` before persisting.
   */
  append(ref: EntityRef, event: Omit<AiEvent, "at" | "id">): Promise<void> {
    const metaRef = entityRefToMetaRef(ref);
    const key = metaRefKey(metaRef);
    const prev = pendingAppends.get(key) ?? Promise.resolve();
    const next = prev.then(() => this.#doAppend(metaRef, event));
    const tracked = next.finally(() => {
      if (pendingAppends.get(key) === tracked) pendingAppends.delete(key);
    });
    pendingAppends.set(key, tracked);
    return next;
  }

  async #doAppend(metaRef: MetaRef, event: Omit<AiEvent, "at" | "id">): Promise<void> {
    const { meta, events } = await this.#readMeta(metaRef);
    const stamped: AiEvent = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() };
    await this.#sidecar.write(metaRef, { ...meta, aiEvents: prune([...events, stamped]) });
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

  /**
   * Fingerprint cache check — not on the AiEventLog interface; used by the recipe
   * runner to short-circuit repeated suggestion fetches when inputs haven't changed.
   * Rejected-event hashes are folded into the fingerprint so new rejections bust the cache.
   */
  async checkFingerprint(
    ref: EntityRef,
    inputs: FingerprintInputs,
    force = false,
  ): Promise<SkipResult> {
    const metaRef = entityRefToMetaRef(ref);
    const { meta, events: existingEvents } = await this.#readMeta(metaRef);

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
