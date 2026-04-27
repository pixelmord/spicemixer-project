import { describe, expect, test } from "vite-plus/test";
import { normalizeYield } from "../src/normalize/yield.ts";

describe("normalizeYield", () => {
  test("passes through string yields", () => {
    expect(normalizeYield("4 servings")).toBe("4 servings");
  });

  test("passes through numeric yields", () => {
    expect(normalizeYield(4)).toBe(4);
  });

  test("converts QuantitativeValue to string", () => {
    expect(normalizeYield({ "@type": "QuantitativeValue", value: "50", unitText: "g" })).toBe(
      "50 g",
    );
  });

  test("prefers maxValue for ranges", () => {
    expect(
      normalizeYield({
        "@type": "QuantitativeValue",
        value: "4",
        maxValue: "6",
        unitText: "portions",
      }),
    ).toBe("6 portions");
  });

  test("takes first item from array", () => {
    expect(normalizeYield(["4 servings", "4"])).toBe("4 servings");
  });

  test("returns undefined for empty input", () => {
    expect(normalizeYield(undefined)).toBeUndefined();
    expect(normalizeYield(null)).toBeUndefined();
  });
});
