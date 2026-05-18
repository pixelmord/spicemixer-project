import { z } from "zod";

export interface EntityRef {
  kind: string;
  id: string;
}

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

export type SourceDescriptor = z.infer<typeof sourceDescriptorSchema>;

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

// ADR 0004: rejected and ingested events are NEVER prunable — they form the
// suppression history and source-attribution record respectively.
export function isPrunable(event: AiEvent): boolean {
  return event.type !== "rejected" && event.type !== "ingested";
}

// Returns the events to KEEP after pruning to capHint. Priority: oldest
// auto-applied pruned first, then oldest accepted.
export function planPrune(events: AiEvent[], capHint = 100): AiEvent[] {
  if (events.length <= capHint) return events;

  const excess = events.length - capHint;

  const prunable = events.filter((e) => isPrunable(e)).sort((a, b) => a.at.localeCompare(b.at));

  const autoApplied = prunable.filter((e) => e.type === "auto-applied");
  const accepted = prunable.filter((e) => e.type === "accepted");
  const toRemove = new Set([...autoApplied, ...accepted].slice(0, excess));

  return events.filter((e) => !toRemove.has(e));
}
