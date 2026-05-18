import { describe, expect, test, beforeEach } from "vite-plus/test";
import { InMemoryAiEventLog, InMemoryTraceSink } from "../src/testing/index.ts";
import type { AiEvent, EntityRef } from "../src/events.ts";
import type { TraceEvent } from "../src/trace.ts";

function makeEvent(type: AiEvent["type"]): Omit<AiEvent, "at" | "id"> {
  return {
    type,
    model: "gpt-test",
    suggestion: { hash: "abc123def456", summary: "test" },
  };
}

const REF: EntityRef = { kind: "recipe", id: "rec-1" };

describe("InMemoryAiEventLog", () => {
  let log: InMemoryAiEventLog;

  beforeEach(() => {
    log = new InMemoryAiEventLog();
  });

  test("read returns empty array for unknown ref", async () => {
    const events = await log.read(REF);
    expect(events).toEqual([]);
  });

  test("append then read returns the event", async () => {
    const event = makeEvent("accepted");
    await log.append(REF, event);
    const events = await log.read(REF);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("accepted");
  });

  test("append stamps id and at — callers never supply them", async () => {
    await log.append(REF, makeEvent("accepted"));
    const [stored] = await log.read(REF);
    expect(typeof stored.id).toBe("string");
    expect(stored.id.length).toBeGreaterThan(0);
    expect(stored.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("append is serialisable per ref — does not cross-contaminate refs", async () => {
    const ref2: EntityRef = { kind: "ingredient", id: "ing-1" };
    await log.append(REF, makeEvent("accepted"));
    await log.append(ref2, makeEvent("rejected"));

    expect(await log.read(REF)).toHaveLength(1);
    expect((await log.read(REF))[0]?.type).toBe("accepted");
    expect(await log.read(ref2)).toHaveLength(1);
    expect((await log.read(ref2))[0]?.type).toBe("rejected");
  });

  test("rejected events survive across multiple appends", async () => {
    await log.append(REF, makeEvent("rejected"));
    await log.append(REF, makeEvent("auto-applied"));
    const events = await log.read(REF);
    expect(events.some((e) => e.type === "rejected")).toBe(true);
  });

  test("all() returns events across all refs", async () => {
    const ref2: EntityRef = { kind: "pairing", id: "p-1" };
    await log.append(REF, makeEvent("accepted"));
    await log.append(ref2, makeEvent("rejected"));
    expect(log.all()).toHaveLength(2);
  });

  test("clear() empties the store", async () => {
    await log.append(REF, makeEvent("accepted"));
    log.clear();
    expect(await log.read(REF)).toEqual([]);
  });
});

describe("InMemoryTraceSink", () => {
  let sink: InMemoryTraceSink;

  beforeEach(() => {
    sink = new InMemoryTraceSink();
  });

  test("starts empty", () => {
    expect(sink.events).toEqual([]);
  });

  test("emit stores the event", () => {
    const event = { traceId: "t1" } as TraceEvent;
    sink.emit(event);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toBe(event);
  });

  test("clear() empties stored events", () => {
    sink.emit({ traceId: "t1" } as TraceEvent);
    sink.clear();
    expect(sink.events).toEqual([]);
  });
});
