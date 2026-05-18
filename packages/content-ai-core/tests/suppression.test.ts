import { describe, expect, test } from "vite-plus/test";
import { buildRejectedContext, filterSuggestions, isSuppressed } from "../src/suppression.ts";
import type { AiEvent } from "../src/events.ts";

function rejected(field: string, hash: string): AiEvent {
  return {
    id: "test-id",
    type: "rejected",
    field,
    at: new Date().toISOString(),
    model: "gpt-test",
    suggestion: { hash, summary: "rejected suggestion" },
  };
}

function accepted(field: string, hash: string): AiEvent {
  return {
    id: "test-id",
    type: "accepted",
    field,
    at: new Date().toISOString(),
    model: "gpt-test",
    suggestion: { hash, summary: "accepted suggestion" },
  };
}

describe("isSuppressed", () => {
  test("returns true when a rejected event matches field+hash", () => {
    const events: AiEvent[] = [rejected("name", "abc123def456")];
    expect(isSuppressed(events, "name", "abc123def456")).toBe(true);
  });

  test("returns false when no rejected event matches", () => {
    const events: AiEvent[] = [accepted("name", "abc123def456")];
    expect(isSuppressed(events, "name", "abc123def456")).toBe(false);
  });

  test("returns false when field matches but hash differs", () => {
    const events: AiEvent[] = [rejected("name", "different0000")];
    expect(isSuppressed(events, "name", "abc123def456")).toBe(false);
  });

  test("returns false when hash matches but field differs", () => {
    const events: AiEvent[] = [rejected("description", "abc123def456")];
    expect(isSuppressed(events, "name", "abc123def456")).toBe(false);
  });

  test("returns false for empty event log", () => {
    expect(isSuppressed([], "name", "abc123def456")).toBe(false);
  });
});

describe("filterSuggestions", () => {
  test("removes suppressed suggestions", () => {
    const events: AiEvent[] = [rejected("name", "abc123def456")];
    const suggestions = [
      { field: "name", hash: "abc123def456", value: "Basil" },
      { field: "description", hash: "def456abc123", value: "An herb" },
    ];
    const result = filterSuggestions(events, suggestions);
    expect(result).toHaveLength(1);
    expect(result[0]?.field).toBe("description");
  });

  test("keeps all when nothing is suppressed", () => {
    const suggestions = [{ field: "name", hash: "abc123def456", value: "Basil" }];
    const result = filterSuggestions([], suggestions);
    expect(result).toHaveLength(1);
  });
});

describe("buildRejectedContext", () => {
  test("returns empty string when no rejected events", () => {
    expect(buildRejectedContext([])).toBe("");
  });

  test("lists rejected events with field and summary", () => {
    const events: AiEvent[] = [
      rejected("name", "abc123def456"),
      rejected("description", "def456abc123"),
    ];
    const ctx = buildRejectedContext(events);
    expect(ctx).toContain("[name]");
    expect(ctx).toContain("[description]");
    expect(ctx).toContain("Previously rejected");
  });

  test("uses 'entity' as fallback when field is absent", () => {
    const event: AiEvent = {
      id: "test-id",
      type: "rejected",
      at: new Date().toISOString(),
      model: "gpt-test",
      suggestion: { hash: "abc123def456", summary: "entity-level rejection" },
    };
    const ctx = buildRejectedContext([event]);
    expect(ctx).toContain("[entity]");
  });
});
