import { describe, expect, test } from "vite-plus/test";
import { diffFieldHashes, classifyRefreshKind } from "../src/field-diff.ts";
import type { FieldConfig } from "../src/translation.ts";

// ---------------------------------------------------------------------------
// diffFieldHashes
// ---------------------------------------------------------------------------

describe("diffFieldHashes", () => {
  test("returns empty array when maps are identical", () => {
    const hashes = { name: "abc123", description: "def456" };
    expect(diffFieldHashes(hashes, hashes)).toEqual([]);
  });

  test("returns empty array for two empty maps", () => {
    expect(diffFieldHashes({}, {})).toEqual([]);
  });

  test("identifies a changed field", () => {
    const current = { name: "abc123", description: "def456" };
    const snapshot = { name: "xyz789", description: "def456" };
    expect(diffFieldHashes(current, snapshot)).toEqual(["name"]);
  });

  test("identifies multiple changed fields", () => {
    const current = { name: "abc123", description: "new111", slug: "s1" };
    const snapshot = { name: "old456", description: "old222", slug: "s1" };
    const result = diffFieldHashes(current, snapshot);
    expect(result).toContain("name");
    expect(result).toContain("description");
    expect(result).not.toContain("slug");
  });

  test("treats field present in current but absent in snapshot as changed", () => {
    const current = { name: "abc123", description: "new111" };
    const snapshot = { name: "abc123" };
    expect(diffFieldHashes(current, snapshot)).toEqual(["description"]);
  });

  test("treats field absent in current but present in snapshot as changed", () => {
    const current = { name: "abc123" };
    const snapshot = { name: "abc123", description: "old111" };
    expect(diffFieldHashes(current, snapshot)).toEqual(["description"]);
  });

  test("returns sorted field names", () => {
    const current = { z: "1", a: "changed", m: "3" };
    const snapshot = { z: "1", a: "original", m: "different" };
    expect(diffFieldHashes(current, snapshot)).toEqual(["a", "m"]);
  });
});

// ---------------------------------------------------------------------------
// classifyRefreshKind
// ---------------------------------------------------------------------------

describe("classifyRefreshKind", () => {
  const fieldConfig: Record<string, FieldConfig> = {
    name: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    slug: { translation: { mode: "translate" } },
    keywords: { translation: { mode: "localize" } },
    image: { translation: { mode: "copy" } },
    author: { translation: { mode: "copy" } },
    botanicalName: { translation: { mode: "copy" } },
  };

  test("returns silent when all stale fields are copy-mode", () => {
    expect(classifyRefreshKind(["image", "author"], fieldConfig)).toBe("silent");
  });

  test("returns silent for a single copy-mode stale field", () => {
    expect(classifyRefreshKind(["botanicalName"], fieldConfig)).toBe("silent");
  });

  test("returns silent for empty stale fields list", () => {
    expect(classifyRefreshKind([], fieldConfig)).toBe("silent");
  });

  test("returns review-required when a translate field is stale", () => {
    expect(classifyRefreshKind(["name", "image"], fieldConfig)).toBe("review-required");
  });

  test("returns review-required when a localize field is stale", () => {
    expect(classifyRefreshKind(["keywords"], fieldConfig)).toBe("review-required");
  });

  test("returns review-required when any stale field has no config (defaults to translate)", () => {
    expect(classifyRefreshKind(["unknownField"], fieldConfig)).toBe("review-required");
  });

  test("returns review-required when mix of copy and translate fields are stale", () => {
    expect(classifyRefreshKind(["image", "description"], fieldConfig)).toBe("review-required");
  });
});
