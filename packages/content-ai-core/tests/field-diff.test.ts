import { describe, expect, test } from "vite-plus/test";
import { diffFieldHashes, classifyRefreshKind } from "../src/field-diff.ts";
import type { FieldConfig } from "../src/contract.ts";

describe("diffFieldHashes", () => {
  test("returns empty array for identical maps", () => {
    const h = { name: "abc", slug: "def" };
    expect(diffFieldHashes(h, h)).toEqual([]);
  });

  test("identifies changed fields", () => {
    expect(diffFieldHashes({ name: "new" }, { name: "old" })).toEqual(["name"]);
  });

  test("treats field present in current but absent in snapshot as changed", () => {
    expect(diffFieldHashes({ name: "a", extra: "b" }, { name: "a" })).toEqual(["extra"]);
  });

  test("returns sorted field names", () => {
    const result = diffFieldHashes({ z: "1", a: "changed" }, { z: "1", a: "original" });
    expect(result).toEqual(["a"]);
  });
});

describe("classifyRefreshKind", () => {
  const cfg: Record<string, FieldConfig> = {
    name: { translation: { mode: "translate" } },
    image: { translation: { mode: "copy" } },
  };

  test("returns silent when all stale fields are copy", () => {
    expect(classifyRefreshKind(["image"], cfg)).toBe("silent");
  });

  test("returns review-required when a translate field is stale", () => {
    expect(classifyRefreshKind(["name"], cfg)).toBe("review-required");
  });

  test("returns review-required for unknown field (defaults to translate)", () => {
    expect(classifyRefreshKind(["unknownField"], cfg)).toBe("review-required");
  });

  test("returns silent for empty stale fields", () => {
    expect(classifyRefreshKind([], cfg)).toBe("silent");
  });
});
