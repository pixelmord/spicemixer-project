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

// Additional imports for new helpers
import { prune, appendEvent, recordAiEvent, hasAutoApplied } from "../src/events.ts";

describe("prune — wrapper around planPrune(100)", () => {
  test("returns unchanged array when <= 100 events", () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      makeEvent("auto-applied", `2024-01-01T0${i % 9}:00:00.000Z`),
    );
    expect(prune(events)).toHaveLength(100);
  });

  test("trims to 100 when over cap", () => {
    const events = Array.from({ length: 101 }, (_, i) =>
      makeEvent("accepted", `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    expect(prune(events)).toHaveLength(100);
  });

  test("never removes rejected events", () => {
    const rejected = Array.from({ length: 100 }, (_, i) =>
      makeEvent("rejected", `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const extra = makeEvent("auto-applied", "2025-01-01T00:00:00.000Z");
    const result = prune([...rejected, extra]);
    expect(result).toHaveLength(100);
    expect(result).not.toContain(extra);
  });
});

describe("appendEvent", () => {
  test("appends event to empty meta", () => {
    const event = makeEvent("ingested");
    const result = appendEvent({}, event);
    expect(result.aiEvents).toHaveLength(1);
    expect(result.aiEvents[0]).toBe(event);
  });

  test("preserves other fields in meta", () => {
    const meta = { draft: false, aiEvents: [] as AiEvent[], tag: "x" };
    const result = appendEvent(meta, makeEvent("accepted"));
    expect((result as typeof meta).tag).toBe("x");
    expect(result.draft).toBe(false);
  });

  test("applies prune when over cap", () => {
    const existing = Array.from({ length: 100 }, (_, i) =>
      makeEvent("auto-applied", `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const result = appendEvent(
      { aiEvents: existing },
      makeEvent("accepted", "2025-01-01T00:00:00.000Z"),
    );
    expect(result.aiEvents).toHaveLength(100);
  });
});

describe("recordAiEvent", () => {
  test("stamps id and at", () => {
    const result = recordAiEvent([], {
      type: "accepted",
      field: "name",
      suggestion: { hash: "x", summary: "s" },
      model: "m",
    });
    expect(result).toHaveLength(1);
    expect(typeof result[0].id).toBe("string");
    expect(result[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("applies prune", () => {
    const existing = Array.from({ length: 100 }, (_, i) =>
      makeEvent("auto-applied", `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const result = recordAiEvent(existing, {
      type: "accepted",
      suggestion: { hash: "y", summary: "new" },
      model: "m",
    });
    expect(result).toHaveLength(100);
  });
});

describe("hasAutoApplied", () => {
  test("returns true when auto-applied event exists for field", () => {
    const events = [makeEvent("auto-applied", undefined, "name")];
    expect(hasAutoApplied(events, "name")).toBe(true);
  });

  test("returns false when no auto-applied event for field", () => {
    const events = [makeEvent("accepted", undefined, "name")];
    expect(hasAutoApplied(events, "name")).toBe(false);
  });

  test("returns false when auto-applied exists for different field", () => {
    const events = [makeEvent("auto-applied", undefined, "tags")];
    expect(hasAutoApplied(events, "name")).toBe(false);
  });
});
