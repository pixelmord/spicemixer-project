import { describe, test, expect } from "vite-plus/test";
import { subscribe } from "../src/pubsub.ts";
import { PubSubTraceSink } from "../src/trace/sinks/pubsub.ts";
import type { TraceEvent } from "../src/trace/sinks/types.ts";

const FIXTURE: TraceEvent = {
  traceId: "t-psink-1",
  runId: "r-psink-1",
  at: "2024-01-15T10:00:00.000Z",
  origin: {
    surface: "admin",
    action: "test-action",
    triggeredBy: "editor",
    userInitiated: true,
    runId: "r-psink-1",
  },
  model: "gpt-4o-mini",
  finishReason: "stop",
  usage: { promptTokens: 5, completionTokens: 3 },
  durationMs: 120,
  params: { system: "sys", prompt: "hi" },
  result: { text: "hello" },
};

describe("PubSubTraceSink", () => {
  test("emit publishes a trace event to the pubsub channel for that runId", async () => {
    const events: unknown[] = [];
    const unsub = subscribe("r-psink-1", (e) => events.push(e));
    const sink = new PubSubTraceSink();
    await sink.emit(FIXTURE);
    unsub();
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev["type"]).toBe("trace");
    expect(ev["traceId"]).toBe("t-psink-1");
    expect(ev["action"]).toBe("test-action");
  });

  test("does not publish to unrelated runId channels", async () => {
    const events: unknown[] = [];
    const unsub = subscribe("r-psink-other", (e) => events.push(e));
    const sink = new PubSubTraceSink();
    await sink.emit(FIXTURE); // runId is r-psink-1
    unsub();
    expect(events).toHaveLength(0);
  });

  test("emit is a no-op when no subscriber exists for the runId", async () => {
    const sink = new PubSubTraceSink();
    await expect(sink.emit(FIXTURE)).resolves.toBeUndefined();
  });
});
