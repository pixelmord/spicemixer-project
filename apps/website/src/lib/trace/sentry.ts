import type { TraceSink, TraceEvent, TraceFinishReason } from "@pixelmord/content-ai-core";

// The `never` sentinels make it a compile-time error to assign an object
// carrying banned body fields (prompts, responses) to SpanScalars.
export type SpanScalars = {
  "gen_ai.request.model": string;
  "gen_ai.usage.input_tokens": number;
  "gen_ai.usage.output_tokens": number;
  "gen_ai.finish_reason": TraceFinishReason;
  "gen_ai.duration_ms": number;
  "origin.surface": string;
  "origin.action": string;
  "origin.entity_kind"?: string;
  "origin.field"?: string;
  "origin.user_initiated": boolean;
  "origin.run_id": string;
  "origin.triggered_by": "editor" | "system";
  outcome: "ok" | "error";
  messages?: never;
  "response.text"?: never;
};

const BANNED_FIELDS = ["messages", "response.text"] as const;

export function scrub(event: TraceEvent): SpanScalars {
  const raw = event as unknown as Record<string, unknown>;
  for (const field of BANNED_FIELDS) {
    if (field in raw) {
      throw new Error(`Banned field "${field}" present in trace event — cannot send to Sentry`);
    }
  }
  return {
    "gen_ai.request.model": event.model,
    "gen_ai.usage.input_tokens": event.usage.promptTokens,
    "gen_ai.usage.output_tokens": event.usage.completionTokens,
    "gen_ai.finish_reason": event.finishReason,
    "gen_ai.duration_ms": event.durationMs,
    "origin.surface": event.origin.surface,
    "origin.action": event.origin.action,
    "origin.entity_kind": event.origin.entityKind,
    "origin.field": event.origin.field,
    "origin.user_initiated": event.origin.userInitiated,
    "origin.run_id": event.origin.runId,
    "origin.triggered_by": event.origin.triggeredBy,
    outcome: event.error ? "error" : "ok",
  };
}

// 100 % for errors / non-stop finish reasons; 25 % for clean successes.
export function tracesSampler(
  scalars: Pick<SpanScalars, "outcome" | "gen_ai.finish_reason">,
): number {
  if (scalars.outcome === "error" || scalars["gen_ai.finish_reason"] !== "stop") {
    return 1.0;
  }
  return 0.25;
}

type SentrySpan = { end(): void };

interface RootEntry {
  span: SentrySpan;
  timer: ReturnType<typeof setTimeout>;
}

export class SentrySpanSink implements TraceSink {
  private readonly rootSpans = new Map<string, RootEntry>();
  private readonly rootTtlMs: number;

  constructor(rootTtlMs = 30_000) {
    this.rootTtlMs = rootTtlMs;
  }

  async emit(event: TraceEvent): Promise<void> {
    if (!process.env["SENTRY_DSN"]) return;

    const scalars = scrub(event);

    if (Math.random() > tracesSampler(scalars)) return;

    // Lazy-import: zero startup cost when Sentry is absent.
    const { startInactiveSpan, withActiveSpan } = await import("@sentry/node");

    const existing = this.rootSpans.get(event.runId);
    if (existing) clearTimeout(existing.timer);

    const rootSpan: SentrySpan =
      existing?.span ??
      (startInactiveSpan({
        name: "gen_ai.invoke_agent",
        op: "gen_ai.invoke_agent",
        forceTransaction: true,
        attributes: {
          "origin.surface": scalars["origin.surface"],
          "origin.action": scalars["origin.action"],
          "origin.run_id": scalars["origin.run_id"],
          "origin.triggered_by": scalars["origin.triggered_by"],
        },
      }) as SentrySpan);

    const timer = setTimeout(() => {
      rootSpan.end();
      this.rootSpans.delete(event.runId);
    }, this.rootTtlMs);

    this.rootSpans.set(event.runId, { span: rootSpan, timer });

    const attrs: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(scalars)) {
      if (v !== undefined && v !== null) {
        attrs[k] = v as string | number | boolean;
      }
    }

    await withActiveSpan(rootSpan as Parameters<typeof withActiveSpan>[0], async () => {
      const child = startInactiveSpan({
        name: "gen_ai.request",
        op: "gen_ai.request",
        attributes: attrs,
      }) as SentrySpan;
      child.end();
    });
  }
}
