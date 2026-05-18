import { describe, expect, test } from "vite-plus/test";
import {
  aiEventSchema,
  isPrunable,
  planPrune,
  sourceDescriptorSchema,
  normalizeSourceField,
} from "../src/events.ts";
import type { AiEvent, SourceDescriptor } from "../src/events.ts";

function makeEvent(type: AiEvent["type"], at = new Date().toISOString(), field?: string): AiEvent {
  return {
    id: "test-id",
    type,
    at,
    model: "gpt-test",
    suggestion: { hash: "abc123def456", summary: "test" },
    ...(field ? { field } : {}),
  };
}

describe("isPrunable", () => {
  test("auto-applied is prunable", () => {
    expect(isPrunable(makeEvent("auto-applied"))).toBe(true);
  });

  test("accepted is prunable", () => {
    expect(isPrunable(makeEvent("accepted"))).toBe(true);
  });

  test("rejected is NOT prunable — ADR 0004", () => {
    expect(isPrunable(makeEvent("rejected"))).toBe(false);
  });

  test("ingested is NOT prunable — ADR 0004", () => {
    expect(isPrunable(makeEvent("ingested"))).toBe(false);
  });
});

describe("planPrune", () => {
  test("returns all events when under cap", () => {
    const events = [makeEvent("accepted"), makeEvent("rejected")];
    expect(planPrune(events, 100)).toHaveLength(2);
  });

  test("returns same array reference when nothing to prune", () => {
    const events = [makeEvent("accepted")];
    const result = planPrune(events, 100);
    expect(result).toHaveLength(1);
  });

  test("prunes oldest auto-applied first when over cap", () => {
    const old = makeEvent("auto-applied", "2024-01-01T00:00:00.000Z");
    const recent = makeEvent("auto-applied", "2024-06-01T00:00:00.000Z");
    const rejected = makeEvent("rejected", "2024-01-01T00:00:00.000Z");
    const events = [old, recent, rejected];

    const result = planPrune(events, 2);
    expect(result).not.toContain(old);
    expect(result).toContain(recent);
    expect(result).toContain(rejected);
  });

  test("never removes rejected events even when severely over cap", () => {
    const rejectedEvents = Array.from({ length: 10 }, (_, i) =>
      makeEvent("rejected", `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const autoApplied = Array.from({ length: 5 }, (_, i) =>
      makeEvent("auto-applied", `2024-02-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const events = [...rejectedEvents, ...autoApplied];
    const result = planPrune(events, 5);

    for (const e of rejectedEvents) {
      expect(result).toContain(e);
    }
  });

  test("never removes ingested events even when over cap", () => {
    const ingestedEvent = makeEvent("ingested", "2024-01-01T00:00:00.000Z");
    const autoApplied = Array.from({ length: 5 }, (_, i) =>
      makeEvent("auto-applied", `2024-02-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const events = [ingestedEvent, ...autoApplied];
    const result = planPrune(events, 3);

    expect(result).toContain(ingestedEvent);
  });

  test("prunes oldest accepted after auto-applied are exhausted", () => {
    const accepted = makeEvent("accepted", "2024-01-01T00:00:00.000Z");
    const recentAccepted = makeEvent("accepted", "2024-06-01T00:00:00.000Z");
    const events = [accepted, recentAccepted];

    const result = planPrune(events, 1);
    expect(result).not.toContain(accepted);
    expect(result).toContain(recentAccepted);
  });
});

describe("aiEventSchema", () => {
  test("id is a required field — events without id are rejected", () => {
    const withoutId = {
      type: "accepted",
      at: "2024-01-01T00:00:00.000Z",
      model: "gpt-4",
      suggestion: { hash: "abc123def456", summary: "looks good" },
    };
    expect(() => aiEventSchema.parse(withoutId)).toThrow();
  });

  test("parses a valid event with id", () => {
    const input = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      type: "accepted",
      at: "2024-01-01T00:00:00.000Z",
      model: "gpt-4",
      suggestion: { hash: "abc123def456", summary: "looks good" },
    };
    expect(() => aiEventSchema.parse(input)).not.toThrow();
  });

  test("rejects unknown event type", () => {
    const input = {
      id: "test-id",
      type: "unknown",
      at: "2024-01-01T00:00:00.000Z",
      model: "x",
      suggestion: { hash: "x", summary: "x" },
    };
    expect(() => aiEventSchema.parse(input)).toThrow();
  });

  test("accepts string source", () => {
    const input = {
      id: "test-id",
      type: "ingested",
      at: "2024-01-01T00:00:00.000Z",
      model: "gpt-4",
      suggestion: { hash: "abc123def456", summary: "extracted" },
      source: "https://example.com",
    };
    expect(() => aiEventSchema.parse(input)).not.toThrow();
  });

  test("accepts SourceDescriptor source", () => {
    const input = {
      id: "test-id",
      type: "ingested",
      at: "2024-01-01T00:00:00.000Z",
      model: "gpt-4",
      suggestion: { hash: "abc123def456", summary: "extracted" },
      source: {
        kind: "pdf",
        hash: "abc",
        mime: "application/pdf",
        sizeBytes: 1024,
        ingestedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    expect(() => aiEventSchema.parse(input)).not.toThrow();
  });

  test("source is optional — event without source parses", () => {
    const input = {
      id: "test-id",
      type: "accepted",
      at: "2024-01-01T00:00:00.000Z",
      model: "gpt-4",
      suggestion: { hash: "abc123def456", summary: "looks good" },
    };
    expect(() => aiEventSchema.parse(input)).not.toThrow();
  });
});

describe("sourceDescriptorSchema", () => {
  test("parses a minimal pdf descriptor", () => {
    const input = {
      kind: "pdf",
      hash: "abc123",
      mime: "application/pdf",
      sizeBytes: 1024,
      ingestedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(() => sourceDescriptorSchema.parse(input)).not.toThrow();
  });

  test("parses a url descriptor with optional fields", () => {
    const input = {
      kind: "url",
      url: "https://example.com",
      hash: "",
      mime: "text/html",
      sizeBytes: 0,
      ingestedAt: "2026-01-01T00:00:00.000Z",
      traceId: "trace-abc",
    };
    expect(() => sourceDescriptorSchema.parse(input)).not.toThrow();
  });

  test("rejects unknown kind", () => {
    expect(() =>
      sourceDescriptorSchema.parse({
        kind: "zip",
        hash: "x",
        mime: "x",
        sizeBytes: 0,
        ingestedAt: "x",
      }),
    ).toThrow();
  });
});

describe("normalizeSourceField", () => {
  test("returns undefined when source is undefined", () => {
    expect(normalizeSourceField(undefined)).toBeUndefined();
  });

  test("converts string url to SourceDescriptor with kind=url", () => {
    const result = normalizeSourceField("https://example.com");
    expect(result).toMatchObject({ kind: "url", url: "https://example.com", mime: "text/html" });
  });

  test("passes through an existing SourceDescriptor unchanged", () => {
    const descriptor: SourceDescriptor = {
      kind: "pdf",
      hash: "abc",
      mime: "application/pdf",
      sizeBytes: 100,
      ingestedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(normalizeSourceField(descriptor)).toBe(descriptor);
  });
});
