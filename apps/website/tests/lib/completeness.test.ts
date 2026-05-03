import { describe, expect, test } from "vite-plus/test";
import {
  scoreIngredient,
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
} from "../../src/lib/completeness.ts";

const FULL_REQUIRED = { name: "Cardamom", category: "spice", summary: "A great spice" };
const FULL_RECOMMENDED = {
  description: "Very aromatic",
  botanicalName: "Elettaria cardamomum",
  family: "Zingiberaceae",
  origin: ["India"],
  parts: ["seed"],
  culinaryUse: "Used in chai and desserts",
  flavorProfile: ["warm"],
  images: ["https://example.com/img.jpg"],
};

describe("INGREDIENT_REQUIRED", () => {
  test("contains exactly name, category, summary", () => {
    expect(INGREDIENT_REQUIRED).toContain("name");
    expect(INGREDIENT_REQUIRED).toContain("category");
    expect(INGREDIENT_REQUIRED).toContain("summary");
    expect(INGREDIENT_REQUIRED).toHaveLength(3);
  });
});

describe("INGREDIENT_RECOMMENDED", () => {
  test("contains images[0] not images or image (singular)", () => {
    expect(INGREDIENT_RECOMMENDED).toContain("images[0]");
    expect(INGREDIENT_RECOMMENDED).not.toContain("images");
    expect(INGREDIENT_RECOMMENDED).not.toContain("image");
  });

  test("contains all taxonomy and content fields", () => {
    expect(INGREDIENT_RECOMMENDED).toContain("description");
    expect(INGREDIENT_RECOMMENDED).toContain("botanicalName");
    expect(INGREDIENT_RECOMMENDED).toContain("family");
    expect(INGREDIENT_RECOMMENDED).toContain("origin");
    expect(INGREDIENT_RECOMMENDED).toContain("parts");
    expect(INGREDIENT_RECOMMENDED).toContain("culinaryUse");
    expect(INGREDIENT_RECOMMENDED).toContain("flavorProfile");
  });
});

describe("scoreIngredient — required fields (table-driven)", () => {
  test.each([
    [{ category: "spice", summary: "A spice" }, "name"],
    [{ name: "Cardamom", summary: "A spice" }, "category"],
    [{ name: "Cardamom", category: "spice" }, "summary"],
  ])("missing required → score 0, red, missing contains %s", (ingredient, missingField) => {
    const result = scoreIngredient(ingredient);
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain(missingField);
  });

  test("empty string summary → score 0", () => {
    const result = scoreIngredient({ name: "Cardamom", category: "spice", summary: "" });
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("summary");
  });
});

describe("scoreIngredient — partial recommended (table-driven)", () => {
  test("all required, no recommended → score 0, red, all recommended in missing", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED });
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    for (const f of INGREDIENT_RECOMMENDED) {
      expect(result.missing).toContain(f);
    }
  });

  test.each([
    [
      { ...FULL_REQUIRED, description: "Aromatic", botanicalName: "Elettaria" },
      ["family", "origin", "parts", "culinaryUse", "flavorProfile", "images[0]"],
    ],
    [
      { ...FULL_REQUIRED, images: ["https://example.com/img.jpg"] },
      ["description", "botanicalName", "family", "origin", "parts", "culinaryUse", "flavorProfile"],
    ],
  ])("partial ingredient → correct missing list", (ingredient, expectedMissing) => {
    const result = scoreIngredient(ingredient);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    for (const m of expectedMissing) {
      expect(result.missing).toContain(m);
    }
  });

  test("3 of 8 recommended filled → amber (score >= 40)", () => {
    const result = scoreIngredient({
      ...FULL_REQUIRED,
      description: "Aromatic",
      botanicalName: "Elettaria",
      family: "Zingiberaceae",
      origin: ["India"],
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.color).toBe("amber");
  });
});

describe("scoreIngredient — images[0] handling", () => {
  test("empty images[] is treated as missing images[0]", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, images: [] });
    expect(result.missing).toContain("images[0]");
  });

  test("images[] with one URL counts as filled", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, images: ["https://example.com/img.jpg"] });
    expect(result.missing).not.toContain("images[0]");
  });

  test("absent images field treated as missing images[0]", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED });
    expect(result.missing).toContain("images[0]");
  });

  test("empty parts[] is treated as missing", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, parts: [] });
    expect(result.missing).toContain("parts");
  });
});

describe("scoreIngredient — full coverage", () => {
  test("all required + all recommended → score 100, green, no missing", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, ...FULL_RECOMMENDED });
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });
});
