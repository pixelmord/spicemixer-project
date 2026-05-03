import { describe, expect, test } from "vite-plus/test";
import {
  assertAutoApplyAllowed,
  isAllowedAutoApply,
  hashSuggestion,
  recordAiEvent,
  hasAutoApplied,
} from "../src/index.ts";
import type { AiEvent, AutoApplyKind } from "../src/index.ts";

// ── Gate enforcement ──────────────────────────────────────────────────────────

describe("auto-apply gate: allowlisted high-confidence passes", () => {
  test("ingredient-link high-confidence editor origin passes", () => {
    expect(() => assertAutoApplyAllowed("ingredient-link", "high", "editor")).not.toThrow();
  });

  test("pairing-slug high-confidence editor origin passes", () => {
    expect(() => assertAutoApplyAllowed("pairing-slug", "high", "editor")).not.toThrow();
  });

  test("language-detection high-confidence editor origin passes", () => {
    expect(() => assertAutoApplyAllowed("language-detection", "high", "editor")).not.toThrow();
  });

  test("tag high-confidence editor origin passes", () => {
    expect(() => assertAutoApplyAllowed("tag", "high", "editor")).not.toThrow();
  });

  test("image-attribution high-confidence editor origin passes", () => {
    expect(() => assertAutoApplyAllowed("image-attribution", "high", "editor")).not.toThrow();
  });
});

describe("auto-apply gate: blocked cases", () => {
  test("medium-confidence ingredient-link does NOT auto-apply", () => {
    expect(isAllowedAutoApply("ingredient-link", "medium", "editor")).toBe(false);
    expect(() => assertAutoApplyAllowed("ingredient-link", "medium", "editor")).toThrow();
  });

  test("low-confidence ingredient-link does NOT auto-apply", () => {
    expect(isAllowedAutoApply("ingredient-link", "low", "editor")).toBe(false);
  });

  test("high-confidence medicinal kind never auto-applies (not in allowlist)", () => {
    expect(isAllowedAutoApply("medicinal" as AutoApplyKind, "high", "editor")).toBe(false);
    expect(() => assertAutoApplyAllowed("medicinal" as AutoApplyKind, "high", "editor")).toThrow();
  });

  test("high-confidence health kind never auto-applies (not in allowlist)", () => {
    expect(isAllowedAutoApply("health" as AutoApplyKind, "high", "editor")).toBe(false);
  });

  test("high-confidence safety kind never auto-applies (not in allowlist)", () => {
    expect(isAllowedAutoApply("safety" as AutoApplyKind, "high", "editor")).toBe(false);
  });

  test("high-confidence translation never auto-applies (not in allowlist)", () => {
    expect(isAllowedAutoApply("translation" as AutoApplyKind, "high", "editor")).toBe(false);
  });

  test("high-confidence slug-rename never auto-applies (not in allowlist)", () => {
    expect(isAllowedAutoApply("slug-rename" as AutoApplyKind, "high", "editor")).toBe(false);
  });

  test("high-confidence pairing-creation never auto-applies (not in allowlist)", () => {
    expect(isAllowedAutoApply("pairing-creation" as AutoApplyKind, "high", "editor")).toBe(false);
  });

  test("community origin blocks all auto-apply regardless of kind and confidence", () => {
    expect(isAllowedAutoApply("ingredient-link", "high", "community")).toBe(false);
    expect(isAllowedAutoApply("tag", "high", "community")).toBe(false);
  });
});

// ── Auto-apply flow ────────────────────────────────────────────────────────────

describe("auto-apply flow: ingredient-link detection", () => {
  test("high-confidence link auto-applies and records auto-applied event", () => {
    const events: AiEvent[] = [];
    assertAutoApplyAllowed("ingredient-link", "high", "editor");

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

  test("medium-confidence link gate throws — does not auto-apply", () => {
    expect(() => assertAutoApplyAllowed("ingredient-link", "medium", "editor")).toThrow(
      'Auto-apply not allowed: kind="ingredient-link" confidence="medium" origin="editor"',
    );
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
