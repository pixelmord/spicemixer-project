import { describe, expect, test } from "vite-plus/test";
import { normalizeIngredients } from "../src/normalize/ingredients.ts";

describe("normalizeIngredients", () => {
  test("passes through string ingredients", () => {
    expect(normalizeIngredients(["2 cups flour", "1 tsp salt"])).toEqual([
      "2 cups flour",
      "1 tsp salt",
    ]);
  });

  test("converts PropertyValue to string", () => {
    const result = normalizeIngredients([
      { "@type": "PropertyValue", value: "2", unitText: "tbsp", name: "olive oil" },
    ]);
    expect(result).toEqual(["2 tbsp olive oil"]);
  });

  test("handles mixed string and PropertyValue", () => {
    const result = normalizeIngredients([
      { "@type": "PropertyValue", value: "1", unitText: "tsp", name: "salt" },
      "2 cloves garlic",
    ]);
    expect(result).toEqual(["1 tsp salt", "2 cloves garlic"]);
  });

  test("flattens nested arrays", () => {
    const result = normalizeIngredients([["1 egg", "2 cups milk"]]);
    expect(result).toEqual(["1 egg", "2 cups milk"]);
  });

  test("normalizes HTML entities in strings", () => {
    expect(normalizeIngredients(["salt &amp; pepper"])).toEqual(["salt & pepper"]);
  });

  test("returns empty array for empty input", () => {
    expect(normalizeIngredients(undefined)).toEqual([]);
    expect(normalizeIngredients([])).toEqual([]);
  });
});
