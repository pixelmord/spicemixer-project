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
  /** The main content record (ingredient, recipe, etc.) */
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

  /** Read the current aiEvents array for the given entity. Returns [] if none. */
  async read(ref: MetaRef): Promise<AiEvent[]> {
    const item = await this.#sidecar.read(ref);
    if (!item) return [];
    const data = item.data as Record<string, unknown>;
    return Array.isArray(data["aiEvents"]) ? (data["aiEvents"] as AiEvent[]) : [];
  }

  /**
   * Full read-modify-write: reads current meta, appends the event to aiEvents,
   * and writes back. Stamps the current ISO timestamp automatically.
   */
  async append(ref: MetaRef, event: Omit<AiEvent, "at">): Promise<void> {
    const item = await this.#sidecar.read(ref);
    const currentMeta = (item?.data as Record<string, unknown> | undefined) ?? {};
    const existingEvents: AiEvent[] = Array.isArray(currentMeta["aiEvents"])
      ? (currentMeta["aiEvents"] as AiEvent[])
      : [];
    const updatedEvents = recordAiEvent(existingEvents, event);
    await this.#sidecar.write(ref, { ...currentMeta, aiEvents: updatedEvents });
  }

  /** Returns true if a rejected event with matching (field, hash) exists. */
  isSuppressed(events: AiEvent[], field: string, hash: string): boolean {
    return isSuppressed(events, field, hash);
  }

  /** Formats rejected events into a context string for the next AI prompt. */
  buildRejectedContext(events: AiEvent[]): string {
    return buildRejectedContext(events);
  }

  /**
   * Checks whether the fingerprint cache in the stored meta matches the current
   * inputs. Reads the entity's stored events to include rejectedHashes in the
   * fingerprint so new rejections automatically bust the cache.
   *
   * Returns { skip: true, cachedSuggestion, fingerprint } when cached,
   * or { skip: false, fingerprint, existingEvents } when a fresh run is needed.
   */
  async shouldSkip(ref: MetaRef, inputs: FingerprintInputs, force = false): Promise<SkipResult> {
    const item = await this.#sidecar.read(ref);
    const meta = (item?.data as Record<string, unknown> | undefined) ?? {};
    const existingEvents: AiEvent[] = Array.isArray(meta["aiEvents"])
      ? (meta["aiEvents"] as AiEvent[])
      : [];

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
