import { describe, expect, test } from "vite-plus/test";
import { normalizePayload, hashSuggestion, hashContent } from "../src/hash.ts";
import {
  ALLOWLIST,
  isAllowedAutoApply,
  assertAutoApplyAllowed,
  type AutoApplyKind,
} from "../src/auto-apply.ts";
import {
  prune,
  isSuppressed,
  filterSuggestions,
  appendEvent,
  recordAiEvent,
  buildRejectedContext,
} from "../src/events.ts";
import type { AiEvent } from "../src/schemas/ai-events.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  type: AiEvent["type"],
  field: string,
  hash: string,
  at = "2026-01-01T00:00:00.000Z",
): AiEvent {
  return { type, field, suggestion: { hash, summary: "test" }, at, model: "test-model" };
}

// ── hash ─────────────────────────────────────────────────────────────────────

describe("normalizePayload", () => {
  test("trims and lowercases strings", () => {
    expect(normalizePayload("  Hello World  ")).toBe("hello world");
  });

  test("sorts object keys", () => {
    const a = normalizePayload({ z: "a", a: "z" });
    const b = normalizePayload({ a: "z", z: "a" });
    expect(a).toBe(b);
  });

  test("normalizes nested objects", () => {
    const a = normalizePayload({ b: { y: "1", x: "2" }, a: "val" });
    const b = normalizePayload({ a: "val", b: { x: "2", y: "1" } });
    expect(a).toBe(b);
  });

  test("normalizes arrays element-by-element", () => {
    expect(normalizePayload(["  A  ", "B"])).toBe(JSON.stringify(["a", "b"]));
  });
});

describe("hashSuggestion", () => {
  test("returns 12 hex characters", () => {
    const h = hashSuggestion({ field: "name", suggestion: "Caraway" });
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  test("is stable across whitespace variations", () => {
    const a = hashSuggestion({ field: "name", suggestion: "  Caraway  " });
    const b = hashSuggestion({ field: "name", suggestion: "caraway" });
    expect(a).toBe(b);
  });

  test("is stable across key-order variations", () => {
    const a = hashSuggestion({ suggestion: "Caraway", field: "name" });
    const b = hashSuggestion({ field: "name", suggestion: "Caraway" });
    expect(a).toBe(b);
  });

  test("is sensitive to actual content", () => {
    const a = hashSuggestion({ field: "name", suggestion: "Caraway" });
    const b = hashSuggestion({ field: "name", suggestion: "Cumin" });
    expect(a).not.toBe(b);
  });

  test("is deterministic across calls", () => {
    const payload = { field: "tags", values: ["spice", "warm"] };
    expect(hashSuggestion(payload)).toBe(hashSuggestion(payload));
  });
});

describe("hashContent", () => {
  test("returns full 64 hex characters", () => {
    expect(hashContent({ name: "test" })).toMatch(/^[0-9a-f]{64}$/);
  });

  test("shares normalization with hashSuggestion", () => {
    const payload = { b: "x", a: "y" };
    const full = hashContent(payload);
    expect(full.slice(0, 12)).toBe(hashSuggestion(payload));
  });
});

// ── auto-apply ────────────────────────────────────────────────────────────────

describe("ALLOWLIST", () => {
  test("contains the five allowed kinds", () => {
    const expected: AutoApplyKind[] = [
      "ingredient-link",
      "pairing-slug",
      "language-detection",
      "tag",
      "image-attribution",
    ];
    for (const kind of expected) {
      expect(ALLOWLIST.has(kind)).toBe(true);
    }
  });
});

describe("isAllowedAutoApply", () => {
  test("returns false for community origin regardless of kind/confidence", () => {
    expect(isAllowedAutoApply("tag", "high", "community")).toBe(false);
    expect(isAllowedAutoApply("ingredient-link", "high", "community")).toBe(false);
  });

  test("returns false for kinds not in allowlist", () => {
    // These kinds should never be auto-applied
    const forbidden = [
      "translation",
      "encyclopedia-text",
      "medicinal",
      "health",
      "safety",
      "slug-rename",
      "variant-fork",
      "pairing-creation",
    ] as unknown as AutoApplyKind[];
    for (const kind of forbidden) {
      expect(isAllowedAutoApply(kind, "high", "editor")).toBe(false);
    }
  });

  test("returns false when confidence is below high", () => {
    expect(isAllowedAutoApply("tag", "medium", "editor")).toBe(false);
    expect(isAllowedAutoApply("tag", "low", "editor")).toBe(false);
  });

  test("returns false for numeric confidence below 0.85", () => {
    expect(isAllowedAutoApply("tag", 0.84, "editor")).toBe(false);
    expect(isAllowedAutoApply("tag", 0.0, "editor")).toBe(false);
  });

  test("returns true for allowed kind + high confidence + editor", () => {
    expect(isAllowedAutoApply("tag", "high", "editor")).toBe(true);
    expect(isAllowedAutoApply("ingredient-link", "high", "editor")).toBe(true);
    expect(isAllowedAutoApply("language-detection", "high", "editor")).toBe(true);
    expect(isAllowedAutoApply("pairing-slug", "high", "editor")).toBe(true);
    expect(isAllowedAutoApply("image-attribution", "high", "editor")).toBe(true);
  });

  test("returns true for numeric confidence >= 0.85 with editor", () => {
    expect(isAllowedAutoApply("tag", 0.85, "editor")).toBe(true);
    expect(isAllowedAutoApply("tag", 1.0, "editor")).toBe(true);
  });
});

describe("assertAutoApplyAllowed", () => {
  test("throws for community origin", () => {
    expect(() => assertAutoApplyAllowed("tag", "high", "community")).toThrow();
  });

  test("throws for non-allowlisted kind", () => {
    expect(() =>
      assertAutoApplyAllowed("translation" as AutoApplyKind, "high", "editor"),
    ).toThrow();
  });

  test("does not throw for allowed combination", () => {
    expect(() => assertAutoApplyAllowed("tag", "high", "editor")).not.toThrow();
  });
});

// ── prune ─────────────────────────────────────────────────────────────────────

describe("prune", () => {
  test("returns unchanged array when <= 100 events", () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      makeEvent("auto-applied", "field", String(i)),
    );
    expect(prune(events)).toHaveLength(100);
  });

  test("removes oldest auto-applied events first", () => {
    const events: AiEvent[] = [
      makeEvent("auto-applied", "f", "old", "2026-01-01T00:00:00.000Z"),
      makeEvent("auto-applied", "f", "new", "2026-01-02T00:00:00.000Z"),
      ...Array.from({ length: 99 }, (_, i) =>
        makeEvent("accepted", "f", `a${i}`, `2026-01-0${(i % 9) + 1}T00:00:00.000Z`),
      ),
    ];
    // 101 events → prune 1 (oldest auto-applied)
    const result = prune(events);
    expect(result).toHaveLength(100);
    expect(result.find((e) => e.suggestion.hash === "old")).toBeUndefined();
    expect(result.find((e) => e.suggestion.hash === "new")).toBeDefined();
  });

  test("removes oldest accepted after all auto-applied exhausted", () => {
    const events: AiEvent[] = [
      makeEvent("accepted", "f", "old-accepted", "2026-01-01T00:00:00.000Z"),
      ...Array.from({ length: 100 }, (_, i) =>
        makeEvent(
          "accepted",
          "f",
          `a${i}`,
          `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        ),
      ),
    ];
    // 101 events, no auto-applied → oldest accepted pruned
    const result = prune(events);
    expect(result).toHaveLength(100);
    expect(result.find((e) => e.suggestion.hash === "old-accepted")).toBeUndefined();
  });

  test("never prunes rejected events", () => {
    const rejected = Array.from({ length: 100 }, (_, i) => makeEvent("rejected", "f", `r${i}`));
    const extra = makeEvent("auto-applied", "f", "extra");
    const result = prune([...rejected, extra]);
    // 101 events → remove the auto-applied, keep all rejected
    expect(result).toHaveLength(100);
    expect(result.find((e) => e.suggestion.hash === "extra")).toBeUndefined();
    expect(result.filter((e) => e.type === "rejected")).toHaveLength(100);
  });

  test("never prunes ingested events", () => {
    const ingested = Array.from({ length: 100 }, (_, i) => makeEvent("ingested", "f", `i${i}`));
    const extra = makeEvent("auto-applied", "f", "extra");
    const result = prune([...ingested, extra]);
    expect(result).toHaveLength(100);
    expect(result.find((e) => e.suggestion.hash === "extra")).toBeUndefined();
    expect(result.filter((e) => e.type === "ingested")).toHaveLength(100);
  });
});

// ── isSuppressed / filterSuggestions ──────────────────────────────────────────

describe("isSuppressed", () => {
  const events: AiEvent[] = [
    makeEvent("rejected", "tags", "abc123"),
    makeEvent("accepted", "name", "def456"),
  ];

  test("returns true for exact (field, hash) match on rejected event", () => {
    expect(isSuppressed(events, "tags", "abc123")).toBe(true);
  });

  test("returns false for same field but different hash", () => {
    expect(isSuppressed(events, "tags", "different")).toBe(false);
  });

  test("returns false for same hash but different field", () => {
    expect(isSuppressed(events, "name", "abc123")).toBe(false);
  });

  test("returns false for accepted event (not rejected)", () => {
    expect(isSuppressed(events, "name", "def456")).toBe(false);
  });
});

describe("filterSuggestions", () => {
  const events: AiEvent[] = [makeEvent("rejected", "tags", "hash1")];

  test("drops suggestions matching a rejected (field, hash)", () => {
    const suggestions = [
      { field: "tags", hash: "hash1", text: "spicy" },
      { field: "tags", hash: "hash2", text: "warm" },
      { field: "name", hash: "hash1", text: "something" },
    ];
    const result = filterSuggestions(events, suggestions);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.hash === "hash1" && s.field === "tags")).toBeUndefined();
  });

  test("passes through when no match", () => {
    const suggestions = [{ field: "name", hash: "nope", text: "x" }];
    expect(filterSuggestions(events, suggestions)).toHaveLength(1);
  });
});

// ── appendEvent / recordAiEvent ───────────────────────────────────────────────

describe("appendEvent", () => {
  test("appends event to empty meta", () => {
    const event = makeEvent("ingested", undefined as unknown as string, "h1");
    const result = appendEvent({}, event);
    expect(result.aiEvents).toHaveLength(1);
    expect(result.aiEvents![0]).toBe(event);
  });

  test("preserves existing meta fields", () => {
    const meta = { draft: false, aiEvents: [] as AiEvent[], tags: ["a"] };
    const event = makeEvent("accepted", "name", "h2");
    const result = appendEvent(meta, event);
    expect(result.draft).toBe(false);
    expect((result as typeof meta).tags).toEqual(["a"]);
  });

  test("calls prune — trims excess events", () => {
    const existing = Array.from({ length: 100 }, (_, i) =>
      makeEvent(
        "auto-applied",
        "f",
        `h${i}`,
        `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );
    const newEvent = makeEvent("accepted", "name", "brand-new");
    const result = appendEvent({ aiEvents: existing }, newEvent);
    expect(result.aiEvents).toHaveLength(100);
    // oldest auto-applied removed, new accepted is present
    expect(result.aiEvents!.find((e) => e.suggestion.hash === "brand-new")).toBeDefined();
  });
});

describe("recordAiEvent", () => {
  test("returns updated events array with the new event appended", () => {
    const events: AiEvent[] = [];
    const result = recordAiEvent(events, {
      type: "rejected",
      field: "tags",
      suggestion: { hash: "abc", summary: "test" },
      model: "claude-sonnet-4-6",
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("rejected");
    expect(result[0].field).toBe("tags");
    expect(result[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("stamps current ISO datetime", () => {
    const before = Date.now();
    const result = recordAiEvent([], {
      type: "accepted",
      field: "name",
      suggestion: { hash: "x", summary: "s" },
      model: "m",
    });
    const after = Date.now();
    const ts = new Date(result[0].at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ── buildRejectedContext ──────────────────────────────────────────────────────

describe("buildRejectedContext", () => {
  test("returns empty string when no rejected events", () => {
    expect(buildRejectedContext([])).toBe("");
  });

  test("returns empty string when all events are non-rejected", () => {
    const events: AiEvent[] = [
      makeEvent("accepted", "name", "h1"),
      makeEvent("auto-applied", "tags", "h2"),
      makeEvent("ingested", "content", "h3"),
    ];
    expect(buildRejectedContext(events)).toBe("");
  });

  test("returns N formatted entries for N rejected events", () => {
    const events: AiEvent[] = [
      {
        type: "rejected",
        field: "name",
        suggestion: { hash: "h1", summary: "Use shorter title" },
        at: "2026-01-01T00:00:00Z",
        model: "m",
      },
      {
        type: "rejected",
        field: "tags",
        suggestion: { hash: "h2", summary: "Add vegan tag" },
        at: "2026-01-02T00:00:00Z",
        model: "m",
      },
    ];
    const ctx = buildRejectedContext(events);
    expect(ctx).toContain("Previously rejected");
    expect(ctx).toContain("[name] Use shorter title");
    expect(ctx).toContain("[tags] Add vegan tag");
  });

  test("formats entry without field as [entity]", () => {
    const events: AiEvent[] = [
      {
        type: "rejected",
        suggestion: { hash: "h1", summary: "Reject whole document" },
        at: "2026-01-01T00:00:00Z",
        model: "m",
      },
    ];
    const ctx = buildRejectedContext(events);
    expect(ctx).toContain("[entity] Reject whole document");
  });

  test("ignores non-rejected events when building context", () => {
    const events: AiEvent[] = [
      makeEvent("accepted", "name", "h1"),
      {
        type: "rejected",
        field: "desc",
        suggestion: { hash: "h2", summary: "rejected one" },
        at: "2026-01-01T00:00:00Z",
        model: "m",
      },
      makeEvent("auto-applied", "tags", "h3"),
    ];
    const ctx = buildRejectedContext(events);
    expect(ctx).toContain("[desc] rejected one");
    // Should NOT contain entries for accepted/auto-applied
    const lines = ctx.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(1);
  });
});
