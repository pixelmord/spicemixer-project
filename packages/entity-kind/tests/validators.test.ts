import { describe, expect, test } from "vite-plus/test";
import { validateSlugUniqueness, validateVariantsClosure } from "../src/validators.ts";

describe("validateSlugUniqueness", () => {
  test("returns empty array when all slugs are unique across collections", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["cardamom", "cumin", "saffron"],
      mixtures: ["harissa", "berbere"],
      recipes: ["miso-ramen"],
    });
    expect(violations).toEqual([]);
  });

  test("returns empty array for empty collections", () => {
    const violations = validateSlugUniqueness({
      ingredients: [],
      mixtures: [],
      recipes: [],
    });
    expect(violations).toEqual([]);
  });

  test("detects slug collision between ingredients and mixtures", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["harissa"],
      mixtures: ["harissa"],
      recipes: [],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.slug).toBe("harissa");
    expect(violations[0]?.collections).toContain("ingredients");
    expect(violations[0]?.collections).toContain("mixtures");
  });

  test("detects slug collision between ingredients and recipes", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["miso"],
      mixtures: [],
      recipes: ["miso"],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.slug).toBe("miso");
    expect(violations[0]?.collections).toContain("ingredients");
    expect(violations[0]?.collections).toContain("recipes");
  });

  test("detects slug collision between mixtures and recipes", () => {
    const violations = validateSlugUniqueness({
      ingredients: [],
      mixtures: ["ramen"],
      recipes: ["ramen"],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.slug).toBe("ramen");
    expect(violations[0]?.collections).toContain("mixtures");
    expect(violations[0]?.collections).toContain("recipes");
  });

  test("detects slug collision across all three collections", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["thing"],
      mixtures: ["thing"],
      recipes: ["thing"],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.slug).toBe("thing");
    expect(violations[0]?.collections).toHaveLength(3);
  });

  test("detects multiple distinct collisions", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["harissa", "cardamom"],
      mixtures: ["harissa", "berbere"],
      recipes: ["cardamom"],
    });
    const slugs = violations.map((v) => v.slug).sort();
    expect(slugs).toEqual(["cardamom", "harissa"]);
  });

  test("no collision when same slug appears multiple times in one collection only", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["cumin", "cumin"],
      mixtures: ["berbere"],
      recipes: [],
    });
    expect(violations).toEqual([]);
  });

  test("error message identifies offending collections", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["cumin"],
      mixtures: ["cumin"],
      recipes: [],
    });
    expect(violations).toHaveLength(1);
    const v = violations[0]!;
    expect(v.slug).toBe("cumin");
    expect(v.collections.sort()).toEqual(["ingredients", "mixtures"]);
  });

  test("works with partial collection input (missing collections)", () => {
    const violations = validateSlugUniqueness({
      ingredients: ["cardamom"],
    });
    expect(violations).toEqual([]);
  });
});

describe("validateVariantsClosure", () => {
  test("returns empty array when no entity has variants", () => {
    const violations = validateVariantsClosure({
      "harissa-moroccan": [],
      "harissa-lebanese": [],
    });
    expect(violations).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    const violations = validateVariantsClosure({});
    expect(violations).toEqual([]);
  });

  test("passes when closure is symmetric", () => {
    const violations = validateVariantsClosure({
      "harissa-moroccan": ["harissa-lebanese"],
      "harissa-lebanese": ["harissa-moroccan"],
    });
    expect(violations).toEqual([]);
  });

  test("passes for three-way symmetric group", () => {
    const violations = validateVariantsClosure({
      "harissa-moroccan": ["harissa-lebanese", "harissa-tunisian"],
      "harissa-lebanese": ["harissa-moroccan", "harissa-tunisian"],
      "harissa-tunisian": ["harissa-moroccan", "harissa-lebanese"],
    });
    expect(violations).toEqual([]);
  });

  test("reports violation when variant does not exist as canonical entity", () => {
    const violations = validateVariantsClosure({
      "harissa-moroccan": ["harissa-lebanese"],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.entity).toBe("harissa-moroccan");
    expect(violations[0]?.variant).toBe("harissa-lebanese");
    expect(violations[0]?.reason).toBe("not-found");
  });

  test("reports violation when back-link is missing", () => {
    const violations = validateVariantsClosure({
      "harissa-moroccan": ["harissa-lebanese"],
      "harissa-lebanese": [],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.entity).toBe("harissa-moroccan");
    expect(violations[0]?.variant).toBe("harissa-lebanese");
    expect(violations[0]?.reason).toBe("missing-back-link");
  });

  test("reports multiple violations for asymmetric group", () => {
    const violations = validateVariantsClosure({
      a: ["b", "c"],
      b: [],
      c: [],
    });
    expect(violations).toHaveLength(2);
    const reasons = violations.map((v) => v.reason);
    expect(reasons.every((r) => r === "missing-back-link")).toBe(true);
  });

  test("reports not-found before missing-back-link for distinct missing entries", () => {
    const violations = validateVariantsClosure({
      a: ["b", "ghost"],
      b: [],
    });
    const notFound = violations.filter((v) => v.reason === "not-found");
    const missingBackLink = violations.filter((v) => v.reason === "missing-back-link");
    expect(notFound).toHaveLength(1);
    expect(notFound[0]?.variant).toBe("ghost");
    expect(missingBackLink).toHaveLength(1);
    expect(missingBackLink[0]?.variant).toBe("b");
  });

  test("entity not in violation when its variants list is empty (even if others list it)", () => {
    const violations = validateVariantsClosure({
      a: ["b"],
      b: ["a"],
      c: [],
    });
    expect(violations).toEqual([]);
  });

  test("error message identifies entity and variant", () => {
    const violations = validateVariantsClosure({
      "harissa-moroccan": ["harissa-lebanese"],
    });
    const v = violations[0]!;
    expect(v.entity).toBe("harissa-moroccan");
    expect(v.variant).toBe("harissa-lebanese");
    expect(v.reason).toBe("not-found");
  });
});
