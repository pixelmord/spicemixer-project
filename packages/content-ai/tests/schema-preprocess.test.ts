import { describe, expect, test } from "vite-plus/test";
import { recipeExtractSchema } from "../src/schemas/recipe-extract.ts";
import { ingredientExtractSchema } from "../src/schemas/ingredient-extract.ts";
import { pairingExtractSchema } from "../src/schemas/pairing-extract.ts";
import { unwrapSchemaShaped } from "../src/schemas/preprocess.ts";

describe("unwrapSchemaShaped", () => {
  test("unwraps the {type:'object', properties:<data>} envelope", () => {
    const out = unwrapSchemaShaped({
      type: "object",
      properties: { name: "Dukkah", recipeIngredient: ["sesame"] },
    });
    expect(out).toEqual({ name: "Dukkah", recipeIngredient: ["sesame"] });
  });

  test("leaves a normal object alone", () => {
    const data = { name: "Dukkah", recipeIngredient: ["sesame"] };
    expect(unwrapSchemaShaped(data)).toBe(data);
  });

  test("does not unwrap when type is something other than 'object'", () => {
    const data = { type: "spice", properties: { foo: 1 } };
    expect(unwrapSchemaShaped(data)).toBe(data);
  });

  test("does not unwrap when properties is not a plain object", () => {
    const data = { type: "object", properties: ["a", "b"] };
    expect(unwrapSchemaShaped(data)).toBe(data);
  });

  test("passes arrays through unchanged", () => {
    const arr = [1, 2, 3];
    expect(unwrapSchemaShaped(arr)).toBe(arr);
  });
});

describe("schemas accept schema-wrapped output (gpt-4o-mini repair)", () => {
  test("recipeExtractSchema unwraps the JSON Schema envelope", () => {
    const wrapped = {
      type: "object",
      properties: {
        name: "Dukkah",
        description: "Egyptian spice mix",
        recipeIngredient: ["sesame", "hazelnut"],
        recipeInstructions: [{ text: "Toast and grind" }],
      },
    };
    const result = recipeExtractSchema.parse(wrapped);
    expect(result.name).toBe("Dukkah");
    expect(result.recipeIngredient).toEqual(["sesame", "hazelnut"]);
  });

  test("recipeExtractSchema still accepts unwrapped shape", () => {
    const direct = {
      name: "Dukkah",
      recipeIngredient: ["sesame"],
      recipeInstructions: [{ text: "Toast" }],
    };
    const result = recipeExtractSchema.parse(direct);
    expect(result.name).toBe("Dukkah");
  });

  test("ingredientExtractSchema unwraps the envelope", () => {
    const wrapped = {
      type: "object",
      properties: { name: "Cardamom", category: "spice" },
    };
    const result = ingredientExtractSchema.parse(wrapped);
    expect(result.name).toBe("Cardamom");
    expect(result.category).toBe("spice");
  });

  test("pairingExtractSchema unwraps the envelope", () => {
    const wrapped = {
      type: "object",
      properties: {
        ingredient1: "lamb",
        ingredient2: "rosemary",
        description: "Classic combo",
      },
    };
    const result = pairingExtractSchema.parse(wrapped);
    expect(result.ingredient1).toBe("lamb");
  });
});
