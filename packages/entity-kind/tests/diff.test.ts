import { describe, expect, test } from "vite-plus/test";
import { getConfig, diffIngredients, diffRecipes, diffPairings, hasChanges } from "../src/index.ts";
import type { EntityKind } from "../src/index.ts";

describe("scalar changes — table-driven across all three kinds", () => {
  const cases: Array<{
    kind: EntityKind;
    a: Record<string, unknown>;
    b: Record<string, unknown>;
    field: string;
    expected: string;
  }> = [
    {
      kind: "ingredient",
      a: { name: "Cumin", category: "spice" },
      b: { name: "Coriander", category: "spice" },
      field: "name",
      expected: "changed",
    },
    {
      kind: "ingredient",
      a: {},
      b: { name: "Turmeric" },
      field: "name",
      expected: "added",
    },
    {
      kind: "ingredient",
      a: { name: "Turmeric" },
      b: {},
      field: "name",
      expected: "removed",
    },
    {
      kind: "recipe",
      a: { name: "Old Curry", description: "Tasty" },
      b: { name: "New Curry", description: "Tasty" },
      field: "name",
      expected: "changed",
    },
    {
      kind: "recipe",
      a: {},
      b: { name: "My Recipe" },
      field: "name",
      expected: "added",
    },
    {
      kind: "recipe",
      a: { name: "My Recipe" },
      b: {},
      field: "name",
      expected: "removed",
    },
    {
      kind: "pairing",
      a: { descriptions: { en: "Old pairing note" } },
      b: { descriptions: { en: "New pairing note" } },
      field: "description",
      expected: "changed",
    },
    {
      kind: "pairing",
      a: {},
      b: { descriptions: { en: "Fresh note" } },
      field: "description",
      expected: "added",
    },
    {
      kind: "pairing",
      a: { descriptions: { en: "Gone" } },
      b: {},
      field: "description",
      expected: "removed",
    },
  ];

  test.each(cases)("$kind: field '$field' is $expected", ({ kind, a, b, field, expected }) => {
    const { diff } = getConfig(kind);
    const diffs = diff(a, b);
    const entry = diffs.find((d) => d.field === field);
    expect(entry?.kind).toBe(expected);
  });
});

describe("array reorder — unchanged when set is identical", () => {
  test("ingredient: flavorNotes reorder yields unchanged", () => {
    const a = { flavorNotes: ["earthy", "warm", "spicy"] };
    const b = { flavorNotes: ["spicy", "earthy", "warm"] };
    const diffs = diffIngredients(a, b);
    const entry = diffs.find((d) => d.field === "flavorNotes");
    // Set-based diff: same elements → each item is unchanged or not present as removed/added
    const itemDiffs = entry?.itemDiffs ?? [];
    expect(itemDiffs.every((id) => id.kind !== "removed")).toBe(true);
  });

  test("recipe: recipeIngredient reorder yields unchanged items", () => {
    const a = { recipeIngredient: ["salt", "pepper", "cumin"] };
    const b = { recipeIngredient: ["cumin", "salt", "pepper"] };
    const diffs = diffRecipes(a, b);
    const entry = diffs.find((d) => d.field === "recipeIngredient");
    const itemDiffs = entry?.itemDiffs ?? [];
    expect(itemDiffs.filter((id) => id.kind === "removed")).toHaveLength(0);
    expect(itemDiffs.filter((id) => id.kind === "added")).toHaveLength(0);
  });
});

describe("added / removed array items", () => {
  test("ingredient: adding an origin entry is detected", () => {
    const a = { origin: ["India"] };
    const b = { origin: ["India", "Guatemala"] };
    const diffs = diffIngredients(a, b);
    const entry = diffs.find((d) => d.field === "origin")!;
    expect(entry.kind).toBe("changed");
    const added = (entry.itemDiffs ?? []).filter((id) => id.kind === "added");
    expect(added.map((id) => id.value)).toContain("Guatemala");
  });

  test("ingredient: removing an origin entry is detected", () => {
    const a = { origin: ["India", "Sri Lanka"] };
    const b = { origin: ["India"] };
    const diffs = diffIngredients(a, b);
    const entry = diffs.find((d) => d.field === "origin")!;
    expect(entry.kind).toBe("changed");
    const removed = (entry.itemDiffs ?? []).filter((id) => id.kind === "removed");
    expect(removed.map((id) => id.value)).toContain("Sri Lanka");
  });

  test("recipe: adding a keyword is detected", () => {
    const a = { keywords: ["spicy"] };
    const b = { keywords: ["spicy", "vegan"] };
    const diffs = diffRecipes(a, b);
    const entry = diffs.find((d) => d.field === "keywords")!;
    const added = (entry.itemDiffs ?? []).filter((id) => id.kind === "added");
    expect(added.map((id) => id.value)).toContain("vegan");
  });
});

describe("deep nested — pairing descriptions locale handling", () => {
  test("falls back to 'en' when requested locale is missing", () => {
    const a = { descriptions: { en: "Warm and earthy" } };
    const b = { descriptions: { en: "Cool and fresh" } };
    const diffs = diffPairings(a, b, "fr");
    expect(diffs[0].kind).toBe("changed");
    expect(diffs[0].oldValue).toBe("Warm and earthy");
    expect(diffs[0].newValue).toBe("Cool and fresh");
  });

  test("picks correct locale when 'de' provided", () => {
    const a = { descriptions: { en: "Unchanged EN", de: "Altes DE" } };
    const b = { descriptions: { en: "Unchanged EN", de: "Neues DE" } };
    const diffs = diffPairings(a, b, "de");
    expect(diffs[0].kind).toBe("changed");
    expect(diffs[0].oldValue).toBe("Altes DE");
    expect(diffs[0].newValue).toBe("Neues DE");
  });

  test("unchanged when both descriptions are identical", () => {
    const a = { descriptions: { en: "Same text" } };
    const b = { descriptions: { en: "Same text" } };
    const diffs = diffPairings(a, b);
    expect(diffs[0].kind).toBe("unchanged");
  });
});

describe("registry-level: getConfig(kind).diff returns FieldDiff[]", () => {
  const KINDS: EntityKind[] = ["ingredient", "recipe", "pairing"];

  test.each(KINDS)("getConfig('%s').diff returns array", (kind) => {
    const { diff } = getConfig(kind);
    const result = diff({}, {});
    expect(Array.isArray(result)).toBe(true);
  });

  test.each(KINDS)("getConfig('%s').diff: identical inputs → all unchanged", (kind) => {
    const { diff } = getConfig(kind);
    const entity = { name: "Cumin", category: "spice" };
    const result = diff(entity, entity);
    expect(result.every((d) => d.kind === "unchanged")).toBe(true);
  });
});

describe("hasChanges", () => {
  test("returns false when all diffs are unchanged", () => {
    const diffs = diffIngredients({ name: "A" }, { name: "A" });
    expect(hasChanges(diffs)).toBe(false);
  });

  test("returns true when any diff has changed/added/removed", () => {
    const diffs = diffIngredients({ name: "A" }, { name: "B" });
    expect(hasChanges(diffs)).toBe(true);
  });
});
