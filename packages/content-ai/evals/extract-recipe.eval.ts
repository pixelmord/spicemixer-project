import { evalite, createScorer } from "evalite";
import { extractRecipeFromFile } from "../src/extract-recipe.ts";
import type { RecipeExtract } from "../src/schemas/recipe-extract.ts";
import { JsonlCache, hashPrompt } from "./cache.ts";
import {
  schemaValid,
  requiredFieldsPresent,
  ingredientRecall,
  instructionOrderPreserved,
  descriptionFaithful,
} from "./scorers/index.ts";

const AI_CONFIG = {
  baseUrl: process.env["AI_BASE_URL"] ?? "http://localhost:11434/v1",
  apiKey: process.env["AI_API_KEY"] ?? "local",
  model: process.env["AI_MODEL"] ?? "llama3",
};

const cache = new JsonlCache(".ai-trace");

function promptForText(text: string): string {
  return `Extract the recipe from the following text:\n\n${text}`;
}

function hashText(text: string): string {
  return hashPrompt(promptForText(text));
}

interface EvalCase {
  input: string;
  expected: RecipeExtract;
  tags?: string[];
}

const SYNTHETIC_FIXTURES: EvalCase[] = [
  {
    tags: ["synthetic"],
    input: `Pasta Aglio e Olio
Serves: 2

Ingredients:
- 200g spaghetti
- 4 cloves garlic
- 60ml olive oil
- 1/2 tsp chili flakes
- Salt and pepper
- Fresh parsley

Instructions:
1. Cook spaghetti in salted boiling water until al dente.
2. Slice garlic thinly and fry in olive oil over medium heat until golden.
3. Add chili flakes, then toss in drained pasta.
4. Season and garnish with parsley.`,
    expected: {
      name: "Pasta Aglio e Olio",
      recipeYield: "2",
      recipeIngredient: [
        "200g spaghetti",
        "4 cloves garlic",
        "60ml olive oil",
        "1/2 tsp chili flakes",
        "Salt and pepper",
        "Fresh parsley",
      ],
      recipeInstructions: [
        { text: "Cook spaghetti in salted boiling water until al dente." },
        { text: "Slice garlic thinly and fry in olive oil over medium heat until golden." },
        { text: "Add chili flakes, then toss in drained pasta." },
        { text: "Season and garnish with parsley." },
      ],
    },
  },
  {
    tags: ["synthetic"],
    input: `Classic Tomato Soup
Yield: 4 portions

What you need:
- 800g canned tomatoes
- 1 onion, chopped
- 2 cloves garlic
- 500ml vegetable stock
- 1 tsp sugar
- Salt, pepper, and basil

Steps:
1. Sauté onion and garlic in a pot until soft.
2. Add tomatoes and stock, simmer 20 minutes.
3. Blend until smooth.
4. Season with sugar, salt, and pepper.
5. Serve hot with fresh basil.`,
    expected: {
      name: "Classic Tomato Soup",
      recipeYield: "4 portions",
      recipeIngredient: [
        "800g canned tomatoes",
        "1 onion, chopped",
        "2 cloves garlic",
        "500ml vegetable stock",
        "1 tsp sugar",
        "Salt, pepper, and basil",
      ],
      recipeInstructions: [
        { text: "Sauté onion and garlic in a pot until soft." },
        { text: "Add tomatoes and stock, simmer 20 minutes." },
        { text: "Blend until smooth." },
        { text: "Season with sugar, salt, and pepper." },
        { text: "Serve hot with fresh basil." },
      ],
    },
  },
];

async function extractWithCache(text: string): Promise<RecipeExtract> {
  const inputHash = hashText(text);
  const cached = await cache.lookup(inputHash);
  if (cached?.result?.parsedObject) {
    return cached.result.parsedObject as RecipeExtract;
  }
  const result = await extractRecipeFromFile({ kind: "text", content: text }, AI_CONFIG);
  return result.recipe;
}

evalite<string, RecipeExtract, RecipeExtract>("aiExtractRecipe", {
  data: () =>
    SYNTHETIC_FIXTURES.map((f) => ({
      input: f.input,
      expected: f.expected,
    })),

  task: (input) => extractWithCache(input),

  scorers: [
    createScorer({
      name: "schemaValid",
      description: "Output passes RecipeExtract Zod schema",
      scorer: ({ output }) => (schemaValid(output) ? 1 : 0),
    }),

    createScorer({
      name: "requiredFieldsPresent",
      description:
        "Fraction of {name, recipeIngredient, recipeInstructions, recipeYield} non-empty",
      scorer: ({ output }) => requiredFieldsPresent(output),
    }),

    createScorer({
      name: "ingredientRecall",
      description: "Normalized token-overlap recall across expected ingredients (threshold 0.7)",
      scorer: ({ output, expected }) => {
        if (!expected) return 1;
        const { score, missing } = ingredientRecall(output, expected);
        return { score, metadata: { missing } };
      },
    }),

    createScorer({
      name: "instructionOrderPreserved",
      description: "LCS over normalized step text >= 80% of expected length",
      scorer: ({ output, expected }) => {
        if (!expected) return 1;
        return instructionOrderPreserved(output, expected) ? 1 : 0;
      },
    }),

    createScorer({
      name: "descriptionFaithful",
      description: "LLM-as-judge faithfulness (opt-in via AI_JUDGE_* env vars)",
      scorer: async ({ output, expected }) => {
        if (!expected) return 1;
        const verdict = await descriptionFaithful(output, expected);
        if (verdict === "pass") return 1;
        if (verdict === "partial") return 0.5;
        return 0;
      },
    }),
  ],
});
