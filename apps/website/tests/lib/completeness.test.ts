import { describe, expect, test } from "vite-plus/test";
import {
  scoreIngredient,
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
} from "../../src/lib/completeness.ts";

describe("INGREDIENT_REQUIRED", () => {
  test("includes name, category, and summary", () => {
    expect(INGREDIENT_REQUIRED).toContain("name");
    expect(INGREDIENT_REQUIRED).toContain("category");
    expect(INGREDIENT_REQUIRED).toContain("summary");
  });
});

describe("INGREDIENT_RECOMMENDED", () => {
  test("contains images (plural) not image (singular)", () => {
    expect(INGREDIENT_RECOMMENDED).toContain("images");
    expect(INGREDIENT_RECOMMENDED).not.toContain("image");
  });

  test("contains taxonomy fields", () => {
    expect(INGREDIENT_RECOMMENDED).toContain("botanicalName");
    expect(INGREDIENT_RECOMMENDED).toContain("family");
    expect(INGREDIENT_RECOMMENDED).toContain("parts");
    expect(INGREDIENT_RECOMMENDED).toContain("flavorProfile");
  });
});

describe("scoreIngredient", () => {
  test("required fields missing → score 0", () => {
    const result = scoreIngredient({ name: "Cardamom" });
    expect(result.score).toBe(0);
    expect(result.missing).toContain("category");
  });

  test("summary missing → score 0", () => {
    const result = scoreIngredient({ name: "Cardamom", category: "spice" });
    expect(result.score).toBe(0);
    expect(result.missing).toContain("summary");
  });

  test("all required, no recommended → low score", () => {
    const result = scoreIngredient({
      name: "Cardamom",
      category: "spice",
      summary: "A great spice",
    });
    expect(result.score).toBeLessThan(40);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("images");
  });

  test("images[] with one URL counts as filled", () => {
    const result = scoreIngredient({
      name: "Cardamom",
      category: "spice",
      summary: "A great spice",
      description: "Very aromatic",
      images: ["https://example.com/img.jpg"],
      origin: ["India"],
      botanicalName: "Elettaria cardamomum",
      family: "Zingiberaceae",
      parts: ["seed"],
      flavorProfile: ["warm"],
    });
    expect(result.score).toBe(100);
    expect(result.missing).toHaveLength(0);
    expect(result.color).toBe("green");
  });

  test("empty images[] is treated as missing", () => {
    const result = scoreIngredient({
      name: "Cardamom",
      category: "spice",
      summary: "A spice",
      images: [],
    });
    expect(result.missing).toContain("images");
  });

  test("empty parts[] is treated as missing", () => {
    const result = scoreIngredient({
      name: "Cardamom",
      category: "spice",
      summary: "A spice",
      parts: [],
    });
    expect(result.missing).toContain("parts");
  });
});
