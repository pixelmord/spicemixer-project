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
 * Owns the read-modify-write cycle for the per-entity AI event log (ADR 0004).
 * Accepts an AiEventSidecar for storage — wire up via createAiEventLog(sidecar).
 */
export class AiEventLog {
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

  /** Stamps `at` with the current ISO timestamp. */
  async append(ref: MetaRef, event: Omit<AiEvent, "at">): Promise<void> {
    const { meta, events } = await this.#readMeta(ref);
    const updatedEvents = recordAiEvent(events, event);
    await this.#sidecar.write(ref, { ...meta, aiEvents: updatedEvents });
  }

  isSuppressed(events: AiEvent[], field: string, hash: string): boolean {
    return isSuppressed(events, field, hash);
  }

  buildRejectedContext(events: AiEvent[]): string {
    return buildRejectedContext(events);
  }

  // Rejected-event hashes feed the fingerprint so new rejections bust the cache.
  async shouldSkip(ref: MetaRef, inputs: FingerprintInputs, force = false): Promise<SkipResult> {
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
}

export function createAiEventLog(sidecar: AiEventSidecar): AiEventLog {
  return new AiEventLog(sidecar);
}
