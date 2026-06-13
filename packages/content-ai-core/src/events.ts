import { z } from "zod";

/**
 * Identifies one content entity across the substrate: its `kind`
 * (e.g. "recipe") and a `kind`-scoped `id`. The key for event-log reads and
 * the discriminator the consumer keys per-kind behavior off.
 */
export interface EntityRef {
  kind: string;
  id: string;
}

/** Zod schema for {@link SourceDescriptor}. */
export const sourceDescriptorSchema = z.object({
  kind: z.enum(["pdf", "image", "text", "url"]),
  url: z.string().optional(),
  filename: z.string().optional(),
  hash: z.string(),
  mime: z.string(),
  sizeBytes: z.number(),
  model: z.string().optional(),
  ingestedAt: z.string(),
  traceId: z.string().optional(),
});

/**
 * Provenance for an AI fill: what artifact the content was extracted from
 * (a PDF, image, pasted text, or URL), its hash/mime/size, and the model and
 * trace used. Recorded on `ingested` events for source attribution (ADR 0012).
 */
export type SourceDescriptor = z.infer<typeof sourceDescriptorSchema>;

/**
 * Coerce a loose source value into a {@link SourceDescriptor}. A bare string is
 * treated as a URL; an existing descriptor passes through; `undefined` stays
 * `undefined`. Lets callers record provenance without constructing the full
 * descriptor by hand.
 */
export function normalizeSourceField(
  source: string | SourceDescriptor | undefined,
): SourceDescriptor | undefined {
  if (source === undefined) return undefined;
  if (typeof source === "string") {
    return {
      kind: "url",
      url: source,
      hash: "",
      mime: "text/html",
      sizeBytes: 0,
      ingestedAt: new Date().toISOString(),
    };
  }
  return source;
}

/** Zod schema for {@link AiEvent}; use to validate persisted event records. */
export const aiEventSchema = z.object({
  id: z.string(),
  type: z.enum(["auto-applied", "accepted", "rejected", "ingested"]),
  field: z.string().optional(),
  suggestion: z.object({
    hash: z.string(),
    summary: z.string(),
  }),
  at: z.string(),
  model: z.string(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  source: z.union([z.string(), sourceDescriptorSchema]).optional(),
  reason: z.string().optional(),
  traceId: z.string().optional(),
});

/**
 * One entry in an entity's append-only AI history. Records that a suggestion
 * was `auto-applied`, `accepted`, `rejected`, or that content was `ingested`
 * from a source. `rejected` events drive suppression (a re-proposed identical
 * suggestion is filtered); `ingested` events carry source attribution. Both are
 * never pruned. Core stamps `id` and `at`.
 */
export type AiEvent = z.infer<typeof aiEventSchema>;

/**
 * Per-entity AI event log (ADR 0004).
 *
 * Locking contract: `append` must be serialisable per `entityRef`. Concurrent
 * appends to the same ref must not interleave read-prune-write cycles. Each
 * adapter implements its own serialisation (e.g. Spicemixer via a
 * `pendingAppends` promise-chain map, Convex via its native ordering).
 *
 * Core stamps `at` (ISO timestamp) and `id` (`crypto.randomUUID()`) on every
 * persisted event — callers of `append` never supply these fields.
 */
export interface AiEventLog {
  read(ref: EntityRef): Promise<AiEvent[]>;
  append(ref: EntityRef, event: Omit<AiEvent, "at" | "id">): Promise<void>;
}

/**
 * Whether an event may be dropped when trimming a log to its cap. `rejected`
 * and `ingested` events are never prunable (ADR 0004) — they form the
 * suppression history and source-attribution record respectively.
 */
export function isPrunable(event: AiEvent): boolean {
  return event.type !== "rejected" && event.type !== "ingested";
}

/**
 * Compute the events to KEEP after trimming `events` down toward `capHint`.
 * Pure — does not mutate. Drops oldest `auto-applied` first, then oldest
 * `accepted`; never drops `rejected`/`ingested`. Returns the input unchanged
 * when already at or under the cap.
 */
export function planPrune(events: AiEvent[], capHint = 100): AiEvent[] {
  if (events.length <= capHint) return events;

  const excess = events.length - capHint;

  const prunable = events.filter((e) => isPrunable(e)).sort((a, b) => a.at.localeCompare(b.at));

  const autoApplied = prunable.filter((e) => e.type === "auto-applied");
  const accepted = prunable.filter((e) => e.type === "accepted");
  const toRemove = new Set([...autoApplied, ...accepted].slice(0, excess));

  return events.filter((e) => !toRemove.has(e));
}

/** {@link planPrune} at the default cap of 100, returning the events to keep. */
export function prune(events: AiEvent[]): AiEvent[] {
  return planPrune(events, 100);
}

/**
 * Return a copy of `meta` with `event` appended to its `aiEvents` and the list
 * pruned to cap. Immutable — does not mutate the input meta.
 */
export function appendEvent<M extends { aiEvents?: AiEvent[] }>(
  meta: M,
  event: AiEvent,
): M & { aiEvents: AiEvent[] } {
  const current = meta.aiEvents ?? [];
  return { ...meta, aiEvents: prune([...current, event]) } as M & { aiEvents: AiEvent[] };
}

/** Stamp a new `id` (`crypto.randomUUID()`) and `at` (ISO now) onto an event. */
export function createAiEvent(params: Omit<AiEvent, "id" | "at">): AiEvent {
  return { ...params, id: crypto.randomUUID(), at: new Date().toISOString() };
}

/**
 * Stamp and append an event to an in-memory list, returning a new pruned array.
 * Convenience over {@link createAiEvent} + {@link prune} for the common case.
 */
export function recordAiEvent(events: AiEvent[], params: Omit<AiEvent, "at" | "id">): AiEvent[] {
  return prune([...events, createAiEvent(params)]);
}

/** Whether the log already has an `auto-applied` event for `field`. */
export function hasAutoApplied(events: AiEvent[], field: string): boolean {
  return events.some((e) => e.type === "auto-applied" && e.field === field);
}
