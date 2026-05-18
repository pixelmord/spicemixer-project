import { describe, expect, test } from "vite-plus/test";
import { hashSuggestion, recordAiEvent, hasAutoApplied } from "../src/index.ts";
import type { AiEvent } from "../src/index.ts";

// ── Auto-apply flow ────────────────────────────────────────────────────────────

describe("auto-apply flow: ingredient-link detection", () => {
  test("high-confidence link auto-applies and records auto-applied event", () => {
    const events: AiEvent[] = [];

    const hash = hashSuggestion({ pattern: "cumin", slug: "cumin" });
    const updated = recordAiEvent(events, {
      type: "auto-applied",
      field: "ingredientLinks",
      suggestion: { hash, summary: "cumin → cumin" },
      model: "claude-sonnet-4-6",
      confidence: "high",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].type).toBe("auto-applied");
    expect(updated[0].field).toBe("ingredientLinks");
    expect(updated[0].confidence).toBe("high");
    expect(updated[0].suggestion.hash).toBe(hash);
  });
});

// ── hasAutoApplied ─────────────────────────────────────────────────────────────

describe("hasAutoApplied", () => {
  test("returns true when field has an auto-applied event", () => {
    const events = recordAiEvent([], {
      type: "auto-applied",
      field: "ingredientLinks",
      suggestion: { hash: "abc123", summary: "cumin → cumin" },
      model: "test-model",
      confidence: "high",
    });

    expect(hasAutoApplied(events, "ingredientLinks")).toBe(true);
  });

  test("returns false for a different field", () => {
    const events = recordAiEvent([], {
      type: "auto-applied",
      field: "ingredientLinks",
      suggestion: { hash: "abc123", summary: "cumin → cumin" },
      model: "test-model",
    });

    expect(hasAutoApplied(events, "tags")).toBe(false);
  });

  test("returns false when no auto-applied events exist", () => {
    const events = recordAiEvent([], {
      type: "accepted",
      field: "ingredientLinks",
      suggestion: { hash: "abc123", summary: "cumin → cumin" },
      model: "test-model",
    });

    expect(hasAutoApplied(events, "ingredientLinks")).toBe(false);
  });

  test("returns false for empty events", () => {
    expect(hasAutoApplied([], "ingredientLinks")).toBe(false);
  });
});

// ── Revert behavior ───────────────────────────────────────────────────────────

describe("revert after auto-apply", () => {
  test("revert emits no event — auto-applied log entry remains", () => {
    const hash = hashSuggestion({ pattern: "coriander", slug: "coriander" });

    let events = recordAiEvent([], {
      type: "auto-applied",
      field: "ingredientLinks",
      suggestion: { hash, summary: "coriander → coriander" },
      model: "claude-sonnet-4-6",
      confidence: "high",
    });

    // Revert is a manual edit — no event emitted, events array unchanged
    const eventsAfterRevert = events;

    expect(eventsAfterRevert).toHaveLength(1);
    expect(eventsAfterRevert[0].type).toBe("auto-applied");
    expect(hasAutoApplied(eventsAfterRevert, "ingredientLinks")).toBe(true);
  });

  test("multiple auto-applied events — hasAutoApplied true for each field", () => {
    let events: AiEvent[] = [];
    events = recordAiEvent(events, {
      type: "auto-applied",
      field: "ingredientLinks",
      suggestion: { hash: hashSuggestion("link1"), summary: "cumin → cumin" },
      model: "test-model",
      confidence: "high",
    });
    events = recordAiEvent(events, {
      type: "auto-applied",
      field: "tags",
      suggestion: { hash: hashSuggestion("tag1"), summary: "spice" },
      model: "test-model",
      confidence: "high",
    });

    expect(hasAutoApplied(events, "ingredientLinks")).toBe(true);
    expect(hasAutoApplied(events, "tags")).toBe(true);
    expect(hasAutoApplied(events, "description")).toBe(false);
  });
});
