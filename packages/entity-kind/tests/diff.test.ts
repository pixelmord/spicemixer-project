import { describe, expect, test } from "vite-plus/test";
import {
  getConfig,
  diffIngredients,
  diffRecipes,
  diffPairings,
  diffWords,
  hasChanges,
} from "../src/index.ts";
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
      a: { description: "Old pairing note" },
      b: { description: "New pairing note" },
      field: "description",
      expected: "changed",
    },
    {
      kind: "pairing",
      a: {},
      b: { description: "Fresh note" },
      field: "description",
      expected: "added",
    },
    {
      kind: "pairing",
      a: { description: "Gone" },
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

describe("diffPairings — per-locale description field", () => {
  test("changed when descriptions differ", () => {
    const a = { description: "Warm and earthy" };
    const b = { description: "Cool and fresh" };
    const diffs = diffPairings(a, b);
    expect(diffs[0].kind).toBe("changed");
    expect(diffs[0].oldValue).toBe("Warm and earthy");
    expect(diffs[0].newValue).toBe("Cool and fresh");
  });

  test("unchanged when descriptions are identical", () => {
    const a = { description: "Same text" };
    const b = { description: "Same text" };
    const diffs = diffPairings(a, b);
    expect(diffs[0].kind).toBe("unchanged");
  });

  test("added when existing has no description", () => {
    const a = {};
    const b = { description: "New description" };
    const diffs = diffPairings(a, b);
    expect(diffs[0].kind).toBe("added");
    expect(diffs[0].newValue).toBe("New description");
  });

  test("removed when proposed has no description", () => {
    const a = { description: "Old description" };
    const b = {};
    const diffs = diffPairings(a, b);
    expect(diffs[0].kind).toBe("removed");
    expect(diffs[0].oldValue).toBe("Old description");
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

describe("diffWords", () => {
  test("identical strings → all unchanged", () => {
    const tokens = diffWords("hello world", "hello world");
    expect(tokens.every((t) => t.kind === "unchanged")).toBe(true);
    expect(tokens.map((t) => t.text).join("")).toBe("hello world");
  });

  test("added word at end", () => {
    const tokens = diffWords("hello", "hello world");
    const added = tokens.filter((t) => t.kind === "added");
    expect(added.some((t) => t.text === "world")).toBe(true);
    expect(tokens.filter((t) => t.kind === "removed")).toHaveLength(0);
  });

  test("removed word", () => {
    const tokens = diffWords("hello world", "hello");
    const removed = tokens.filter((t) => t.kind === "removed");
    expect(removed.some((t) => t.text === "world")).toBe(true);
  });

  test("changed word", () => {
    const tokens = diffWords("hello world", "hello earth");
    expect(tokens.some((t) => t.kind === "added" && t.text === "earth")).toBe(true);
    expect(tokens.some((t) => t.kind === "removed" && t.text === "world")).toBe(true);
  });

  test("empty before → all added", () => {
    const tokens = diffWords("", "new text");
    expect(tokens.filter((t) => t.kind === "removed")).toHaveLength(0);
    const words = tokens.filter((t) => t.kind === "added").map((t) => t.text);
    expect(words).toContain("new");
    expect(words).toContain("text");
  });

  test("empty after → all removed", () => {
    const tokens = diffWords("old text", "");
    expect(tokens.filter((t) => t.kind === "added")).toHaveLength(0);
    expect(tokens.some((t) => t.kind === "removed" && t.text === "old")).toBe(true);
  });
});

describe("diffRecipes — recipeInstructions with HowToStep objects", () => {
  const step = (text: string) => ({ "@type": "HowToStep", text });

  test("identical HowToStep instructions → all unchanged", () => {
    const instructions = [step("Boil water"), step("Add noodles")];
    const diffs = diffRecipes(
      { recipeInstructions: instructions },
      { recipeInstructions: instructions },
    );
    const entry = diffs.find((d) => d.field === "recipeInstructions")!;
    expect(entry.kind).toBe("unchanged");
    expect(entry.itemDiffs?.every((id) => id.kind === "unchanged")).toBe(true);
  });

  test("added HowToStep is detected", () => {
    const diffs = diffRecipes(
      { recipeInstructions: [step("Boil water")] },
      { recipeInstructions: [step("Boil water"), step("Add noodles")] },
    );
    const entry = diffs.find((d) => d.field === "recipeInstructions")!;
    expect(entry.kind).toBe("changed");
    const added = (entry.itemDiffs ?? []).filter((id) => id.kind === "added");
    expect(added.some((id) => id.value === "Add noodles")).toBe(true);
  });

  test("removed HowToStep is detected", () => {
    const diffs = diffRecipes(
      { recipeInstructions: [step("Boil water"), step("Add noodles")] },
      { recipeInstructions: [step("Boil water")] },
    );
    const entry = diffs.find((d) => d.field === "recipeInstructions")!;
    const removed = (entry.itemDiffs ?? []).filter((id) => id.kind === "removed");
    expect(removed.some((id) => id.value === "Add noodles")).toBe(true);
  });

  test("plain string instructions still work alongside object ones", () => {
    const diffs = diffRecipes(
      { recipeInstructions: ["Step one"] },
      { recipeInstructions: ["Step one", "Step two"] },
    );
    const entry = diffs.find((d) => d.field === "recipeInstructions")!;
    expect(entry.kind).toBe("changed");
  });
});
