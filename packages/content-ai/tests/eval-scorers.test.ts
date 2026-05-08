import { describe, expect, test } from "vite-plus/test";
import type { RecipeExtract } from "../src/schemas/recipe-extract.ts";
import { schemaValid } from "../evals/scorers/schema-valid.ts";
import { requiredFieldsPresent } from "../evals/scorers/required-fields.ts";
import { ingredientRecall } from "../evals/scorers/ingredient-recall.ts";
import { instructionOrderPreserved } from "../evals/scorers/instruction-order.ts";
import { descriptionFaithful } from "../evals/scorers/description-faithful.ts";
import type { Judge } from "../evals/scorers/description-faithful.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipe(overrides: Partial<RecipeExtract> = {}): RecipeExtract {
  return {
    name: "Test Recipe",
    recipeIngredient: ["200g flour", "1 egg"],
    recipeInstructions: [{ text: "Mix ingredients." }, { text: "Bake 30 minutes." }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// schemaValid
// ---------------------------------------------------------------------------

describe("schemaValid", () => {
  test("returns true for valid RecipeExtract", () => {
    expect(schemaValid(makeRecipe())).toBe(true);
  });

  test("returns true when optional fields absent", () => {
    expect(schemaValid({ name: "X", recipeIngredient: [], recipeInstructions: [] })).toBe(true);
  });

  test("returns false when name missing", () => {
    expect(schemaValid({ recipeIngredient: [], recipeInstructions: [] })).toBe(false);
  });

  test("returns false for null", () => {
    expect(schemaValid(null)).toBe(false);
  });

  test("returns false for non-array recipeIngredient", () => {
    expect(schemaValid({ name: "X", recipeIngredient: "flour", recipeInstructions: [] })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// requiredFieldsPresent
// ---------------------------------------------------------------------------

describe("requiredFieldsPresent", () => {
  test("returns 1 when all 4 required fields present", () => {
    expect(
      requiredFieldsPresent(
        makeRecipe({
          recipeYield: "4",
          recipeIngredient: ["flour"],
          recipeInstructions: [{ text: "mix" }],
        }),
      ),
    ).toBe(1);
  });

  test("returns 0.75 when recipeYield absent", () => {
    expect(requiredFieldsPresent(makeRecipe({ recipeYield: undefined }))).toBeCloseTo(0.75);
  });

  test("returns 0.5 when recipeYield and recipeIngredient absent", () => {
    expect(
      requiredFieldsPresent(makeRecipe({ recipeYield: undefined, recipeIngredient: [] })),
    ).toBeCloseTo(0.5);
  });

  test("returns 0.25 when only name present", () => {
    expect(
      requiredFieldsPresent(
        makeRecipe({ recipeYield: undefined, recipeIngredient: [], recipeInstructions: [] }),
      ),
    ).toBeCloseTo(0.25);
  });

  test("counts empty array recipeIngredient as absent", () => {
    const score = requiredFieldsPresent(makeRecipe({ recipeYield: "4", recipeIngredient: [] }));
    expect(score).toBeCloseTo(0.75);
  });
});

// ---------------------------------------------------------------------------
// ingredientRecall
// ---------------------------------------------------------------------------

describe("ingredientRecall", () => {
  test("score 1 when all expected ingredients matched", () => {
    const expected = makeRecipe({
      recipeIngredient: ["200g flour", "1 egg", "pinch salt"],
    });
    const actual = makeRecipe({
      recipeIngredient: ["200g flour", "1 egg", "pinch salt"],
    });
    expect(ingredientRecall(actual, expected)).toEqual({ score: 1, missing: [] });
  });

  test("score 0 when no ingredients matched", () => {
    const expected = makeRecipe({ recipeIngredient: ["truffle oil", "saffron"] });
    const actual = makeRecipe({ recipeIngredient: ["flour", "water"] });
    const { score, missing } = ingredientRecall(actual, expected);
    expect(score).toBe(0);
    expect(missing).toEqual(["truffle oil", "saffron"]);
  });

  test("order-independent: actual order does not matter", () => {
    const expected = makeRecipe({ recipeIngredient: ["200g flour", "1 egg", "pinch salt"] });
    const actual = makeRecipe({ recipeIngredient: ["pinch salt", "1 egg", "200g flour"] });
    expect(ingredientRecall(actual, expected).score).toBe(1);
  });

  test("modifier reorder: '200g 70% dark chocolate' matches '200g dark chocolate (70%)'", () => {
    const expected = makeRecipe({
      recipeIngredient: ["200g dark chocolate (70%)"],
    });
    const actual = makeRecipe({
      recipeIngredient: ["200g 70% dark chocolate"],
    });
    const { score, missing } = ingredientRecall(actual, expected);
    expect(score).toBe(1);
    expect(missing).toHaveLength(0);
  });

  test("unit-name reordering: 'butter 100g' matches '100g butter'", () => {
    const expected = makeRecipe({ recipeIngredient: ["100g butter"] });
    const actual = makeRecipe({ recipeIngredient: ["butter 100g"] });
    expect(ingredientRecall(actual, expected).score).toBe(1);
  });

  test("partial recall: one of two matched", () => {
    const expected = makeRecipe({ recipeIngredient: ["100g flour", "1 tsp vanilla"] });
    const actual = makeRecipe({ recipeIngredient: ["100g flour", "2 eggs"] });
    const { score, missing } = ingredientRecall(actual, expected);
    expect(score).toBeCloseTo(0.5);
    expect(missing).toEqual(["1 tsp vanilla"]);
  });

  test("unrecovered list is accurate", () => {
    const expected = makeRecipe({ recipeIngredient: ["A", "B", "C"] });
    const actual = makeRecipe({ recipeIngredient: ["A"] });
    const { score, missing } = ingredientRecall(actual, expected);
    expect(score).toBeCloseTo(1 / 3);
    expect(missing).toContain("B");
    expect(missing).toContain("C");
    expect(missing).not.toContain("A");
  });

  test("returns score 1 with no missing when expected list is empty", () => {
    const expected = makeRecipe({ recipeIngredient: [] });
    const actual = makeRecipe({ recipeIngredient: ["flour"] });
    expect(ingredientRecall(actual, expected)).toEqual({ score: 1, missing: [] });
  });
});

// ---------------------------------------------------------------------------
// instructionOrderPreserved
// ---------------------------------------------------------------------------

describe("instructionOrderPreserved", () => {
  test("returns true when all steps match in order", () => {
    const recipe = makeRecipe({
      recipeInstructions: [
        { text: "Preheat oven to 180°C." },
        { text: "Mix flour and butter." },
        { text: "Bake for 30 minutes." },
      ],
    });
    expect(instructionOrderPreserved(recipe, recipe)).toBe(true);
  });

  test("returns false when steps are fully reordered", () => {
    const expected = makeRecipe({
      recipeInstructions: [
        { text: "Step one" },
        { text: "Step two" },
        { text: "Step three" },
        { text: "Step four" },
        { text: "Step five" },
      ],
    });
    const actual = makeRecipe({
      recipeInstructions: [
        { text: "Step five" },
        { text: "Step four" },
        { text: "Step three" },
        { text: "Step two" },
        { text: "Step one" },
      ],
    });
    expect(instructionOrderPreserved(actual, expected)).toBe(false);
  });

  test("returns true when paraphrased steps preserve order (≥80% LCS)", () => {
    const expected = makeRecipe({
      recipeInstructions: [
        { text: "Boil water." },
        { text: "Add pasta." },
        { text: "Drain and serve." },
        { text: "Season with salt." },
        { text: "Garnish with herbs." },
      ],
    });
    const actual = makeRecipe({
      recipeInstructions: [
        { text: "Boil water." },
        { text: "Add pasta." },
        { text: "Drain and serve." },
        { text: "Season with salt." },
        { text: "Garnish with parsley." }, // different text but same position
      ],
    });
    // LCS will be at least 4/5 = 0.8, so this should pass
    // (only last step differs)
    expect(instructionOrderPreserved(actual, expected)).toBe(true);
  });

  test("returns true when expected is empty", () => {
    const expected = makeRecipe({ recipeInstructions: [] });
    const actual = makeRecipe({ recipeInstructions: [{ text: "any step" }] });
    expect(instructionOrderPreserved(actual, expected)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// descriptionFaithful
// ---------------------------------------------------------------------------

describe("descriptionFaithful", () => {
  test("returns 'pass' when judge says pass", async () => {
    const stubJudge: Judge = { generate: async () => "pass" };
    const expected = makeRecipe({ description: "A classic Italian pasta dish." });
    const actual = makeRecipe({ description: "A classic Italian pasta recipe." });
    expect(await descriptionFaithful(actual, expected, stubJudge)).toBe("pass");
  });

  test("returns 'fail' when judge says fail", async () => {
    const stubJudge: Judge = { generate: async () => "fail" };
    const expected = makeRecipe({ description: "A classic Italian pasta dish." });
    const actual = makeRecipe({ description: "A spicy Mexican taco." });
    expect(await descriptionFaithful(actual, expected, stubJudge)).toBe("fail");
  });

  test("returns 'partial' when judge says partial", async () => {
    const stubJudge: Judge = { generate: async () => "partial" };
    expect(await descriptionFaithful(makeRecipe(), makeRecipe(), stubJudge)).toBe("partial");
  });

  test("judge output is case-insensitive (PASS → pass)", async () => {
    const stubJudge: Judge = { generate: async () => "PASS" };
    expect(await descriptionFaithful(makeRecipe(), makeRecipe(), stubJudge)).toBe("pass");
  });

  test("unknown judge output defaults to 'fail'", async () => {
    const stubJudge: Judge = { generate: async () => "maybe" };
    expect(await descriptionFaithful(makeRecipe(), makeRecipe(), stubJudge)).toBe("fail");
  });

  test("returns 'pass' (no-op) when judge is null", async () => {
    expect(await descriptionFaithful(makeRecipe(), makeRecipe(), null)).toBe("pass");
  });

  test("returns 'pass' (no-op) when AI_JUDGE_* env vars unset and no judge arg", async () => {
    delete process.env["AI_JUDGE_BASE_URL"];
    delete process.env["AI_JUDGE_API_KEY"];
    delete process.env["AI_JUDGE_MODEL"];
    expect(await descriptionFaithful(makeRecipe(), makeRecipe())).toBe("pass");
  });
});
