import { describe, expect, test } from "vite-plus/test";
import { hashSuggestion, filterSuggestions, recordAiEvent } from "../src/index.ts";
import type { AiEvent } from "../src/schemas/ai-events.ts";

// Tests the data pipeline without rendering the React component.

// ── helpers ───────────────────────────────────────────────────────────────────

function rejectedEvent(field: string, hash: string): AiEvent {
  return {
    id: "test-id",
    type: "rejected",
    field,
    suggestion: { hash, summary: "test" },
    at: "2026-01-01T00:00:00.000Z",
    model: "test-model",
  };
}

// ── suppression filter ────────────────────────────────────────────────────────

describe("PairingSuggestionPanel suppression filter", () => {
  test("seeded rejected event suppresses matching improvement suggestion", () => {
    const text = "Consider adding heat level notes.";
    const hash = hashSuggestion(text);

    const aiEvents: AiEvent[] = [rejectedEvent("description", hash)];

    const suggestions = [
      { field: "description", hash, summary: text },
      {
        field: "description",
        hash: hashSuggestion("A different suggestion"),
        summary: "A different suggestion",
      },
    ];

    const visible = filterSuggestions(aiEvents, suggestions);
    expect(visible).toHaveLength(1);
    expect(visible[0].summary).toBe("A different suggestion");
  });

  test("new hash on same field is not suppressed", () => {
    const oldHash = hashSuggestion("old suggestion");
    const newHash = hashSuggestion("new suggestion");

    const aiEvents: AiEvent[] = [rejectedEvent("description", oldHash)];

    const suggestions = [{ field: "description", hash: newHash, summary: "new suggestion" }];
    expect(filterSuggestions(aiEvents, suggestions)).toHaveLength(1);
  });

  test("same hash on different field is not suppressed", () => {
    const hash = hashSuggestion("shared content");
    const aiEvents: AiEvent[] = [rejectedEvent("description", hash)];

    const suggestions = [{ field: "title", hash, summary: "shared content" }];
    expect(filterSuggestions(aiEvents, suggestions)).toHaveLength(1);
  });

  test("multiple suggestions — only matching (field, hash) is suppressed", () => {
    const hashA = hashSuggestion("suggestion a");
    const hashB = hashSuggestion("suggestion b");

    const aiEvents: AiEvent[] = [rejectedEvent("tags", hashA)];

    const suggestions = [
      { field: "tags", hash: hashA, summary: "suggestion a" },
      { field: "tags", hash: hashB, summary: "suggestion b" },
      { field: "name", hash: hashA, summary: "suggestion a on different field" },
    ];

    const visible = filterSuggestions(aiEvents, suggestions);
    expect(visible).toHaveLength(2);
    expect(visible.find((s) => s.field === "tags" && s.hash === hashA)).toBeUndefined();
  });
});

// ── event recording ───────────────────────────────────────────────────────────

describe("PairingSuggestionPanel event recording", () => {
  test("Accept appends an accepted event to aiEvents", () => {
    const text = "Consider adding heat level notes.";
    const hash = hashSuggestion(text);

    const updated = recordAiEvent([], {
      type: "accepted",
      field: "description",
      suggestion: { hash, summary: text },
      model: "claude-sonnet-4-6",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].type).toBe("accepted");
    expect(updated[0].field).toBe("description");
    expect(updated[0].suggestion.hash).toBe(hash);
    expect(updated[0].model).toBe("claude-sonnet-4-6");
  });

  test("Reject appends a rejected event with optional reason", () => {
    const hash = hashSuggestion("some suggestion");
    const updated = recordAiEvent([], {
      type: "rejected",
      field: "tags",
      suggestion: { hash, summary: "some suggestion" },
      model: "claude-sonnet-4-6",
      reason: "not relevant",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].type).toBe("rejected");
    expect(updated[0].reason).toBe("not relevant");
  });

  test("Reject without reason omits the reason field", () => {
    const hash = hashSuggestion("no reason needed");
    const updated = recordAiEvent([], {
      type: "rejected",
      field: "name",
      suggestion: { hash, summary: "no reason needed" },
      model: "test-model",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].type).toBe("rejected");
    expect(updated[0].reason).toBeUndefined();
  });

  test("after Reject, the same suggestion is suppressed on subsequent filter", () => {
    const text = "Use more descriptive language.";
    const hash = hashSuggestion(text);

    const events = recordAiEvent([], {
      type: "rejected",
      field: "description",
      suggestion: { hash, summary: text },
      model: "test-model",
    });

    const suggestions = [
      { field: "description", hash, summary: text },
      { field: "description", hash: hashSuggestion("different text"), summary: "different text" },
    ];

    const visible = filterSuggestions(events, suggestions);
    expect(visible).toHaveLength(1);
    expect(visible[0].summary).toBe("different text");
  });
});
