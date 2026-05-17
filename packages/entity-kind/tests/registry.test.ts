import { describe, expect, test } from "vite-plus/test";
import { getConfig, collectionToKind } from "../src/index.ts";
import type { EntityKind } from "../src/index.ts";

const KINDS: EntityKind[] = ["ingredient", "recipe", "pairing"];

describe("EntityKind registry", () => {
  test.each(KINDS)("getConfig(%s) returns a complete config", (kind) => {
    const config = getConfig(kind);
    expect(config.schema).toBeDefined();
    expect(typeof config.diff).toBe("function");
    expect(config.completeness).toBeDefined();
    expect(Array.isArray(config.completeness.required)).toBe(true);
    expect(config.completeness.required.length).toBeGreaterThan(0);
    expect(Array.isArray(config.completeness.recommended)).toBe(true);
    expect(typeof config.completeness.score).toBe("function");
    expect(typeof config.routePrefix).toBe("string");
    expect(config.routePrefix.startsWith("/")).toBe(true);
    expect(config.proposers).toBeDefined();
  });

  test("ingredient config has expected required fields and route", () => {
    const config = getConfig("ingredient");
    expect(config.completeness.required).toContain("name");
    expect(config.completeness.required).toContain("category");
    expect(config.routePrefix).toBe("/ingredients/");
  });

  test("recipe config has expected required fields and route", () => {
    const config = getConfig("recipe");
    expect(config.completeness.required).toContain("name");
    expect(config.completeness.required).toContain("recipeIngredient");
    expect(config.routePrefix).toBe("/recipes/");
  });

  test("pairing config has expected required fields and route", () => {
    const config = getConfig("pairing");
    expect(config.completeness.required).toContain("description");
    expect(config.completeness.required).toContain("endpoints");
    expect(config.routePrefix).toBe("/pairings/");
  });
});

describe("collectionToKind mapping", () => {
  test("recipes and mixtures both map to recipe", () => {
    expect(collectionToKind.recipes).toBe("recipe");
    expect(collectionToKind.mixtures).toBe("recipe");
  });

  test("ingredients maps to ingredient", () => {
    expect(collectionToKind.ingredients).toBe("ingredient");
  });

  test("pairings maps to pairing", () => {
    expect(collectionToKind.pairings).toBe("pairing");
  });
});

describe("diff functions via registry", () => {
  test("ingredient diff detects changed name", () => {
    const { diff } = getConfig("ingredient");
    const diffs = diff({ name: "Cumin" }, { name: "Coriander" });
    const nameDiff = diffs.find((d) => d.field === "name");
    expect(nameDiff?.kind).toBe("changed");
  });

  test("recipe diff detects changed name", () => {
    const { diff } = getConfig("recipe");
    const diffs = diff({ name: "Old Name" }, { name: "New Name" });
    const nameDiff = diffs.find((d) => d.field === "name");
    expect(nameDiff?.kind).toBe("changed");
  });

  test("pairing diff detects changed description", () => {
    const { diff } = getConfig("pairing");
    const diffs = diff({ description: "Old description" }, { description: "New description" });
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs[0].kind).toBe("changed");
  });
});

describe("completeness scoring via registry", () => {
  test("ingredient score returns 0 for empty entity", () => {
    const { completeness } = getConfig("ingredient");
    const result = completeness.score({});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
  });

  test("recipe score returns 0 for empty entity", () => {
    const { completeness } = getConfig("recipe");
    const result = completeness.score({});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
  });

  test("pairing score returns 0 for empty entity", () => {
    const { completeness } = getConfig("pairing");
    const result = completeness.score({});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
  });
});
