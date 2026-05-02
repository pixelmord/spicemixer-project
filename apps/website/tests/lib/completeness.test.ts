import { describe, expect, test } from "vite-plus/test";
import { scoreIngredient, INGREDIENT_RECOMMENDED } from "../../src/lib/completeness.ts";

describe("INGREDIENT_RECOMMENDED", () => {
  test("contains images (plural) not image (singular)", () => {
    expect(INGREDIENT_RECOMMENDED).toContain("images");
    expect(INGREDIENT_RECOMMENDED).not.toContain("image");
  });
});

describe("scoreIngredient", () => {
  test("required fields missing → score 0", () => {
    const result = scoreIngredient({ name: "Cardamom" });
    expect(result.score).toBe(0);
    expect(result.missing).toContain("category");
  });

  test("all required, no recommended → low score", () => {
    const result = scoreIngredient({ name: "Cardamom", category: "spice" });
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
      flavorNotes: ["warm"],
      pairings: [{ slug: "cumin" }],
    });
    expect(result.score).toBe(100);
    expect(result.missing).toHaveLength(0);
    expect(result.color).toBe("green");
  });

  test("empty images[] is treated as missing", () => {
    const result = scoreIngredient({
      name: "Cardamom",
      category: "spice",
      images: [],
    });
    expect(result.missing).toContain("images");
  });
});
