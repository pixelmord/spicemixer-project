import { describe, expect, test } from "vite-plus/test";
import { ingredientSchema } from "../src/schemas.ts";

describe("ingredientSchema — region", () => {
  test("defaults region to empty array when absent", () => {
    const result = ingredientSchema.parse({ name: "Cumin", category: "spice" });
    expect(result.region).toEqual([]);
  });

  test("accepts valid region codes", () => {
    const result = ingredientSchema.parse({
      name: "Cumin",
      category: "spice",
      region: ["south-asia", "north-africa"],
    });
    expect(result.region).toEqual(["south-asia", "north-africa"]);
  });

  test("rejects unknown region codes", () => {
    expect(() =>
      ingredientSchema.parse({
        name: "Cumin",
        category: "spice",
        region: ["not-a-real-region"],
      }),
    ).toThrow();
  });
});
