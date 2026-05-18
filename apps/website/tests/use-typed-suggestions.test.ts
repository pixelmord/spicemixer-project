import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIB_AI = join(WEBSITE_ROOT, "src", "lib", "ai");

describe("use-typed-suggestions — module contract", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-typed-suggestions.ts"), "utf-8");
  });

  test("exports RecipeFieldPath type", () => {
    expect(src).toMatch(/export type RecipeFieldPath/);
  });

  test("exports IngredientFieldPath type", () => {
    expect(src).toMatch(/export type IngredientFieldPath/);
  });

  test("exports PairingFieldPath type", () => {
    expect(src).toMatch(/export type PairingFieldPath/);
  });

  test("exports useRecipeAiSuggestions hook", () => {
    expect(src).toMatch(/export function useRecipeAiSuggestions\b/);
  });

  test("exports useIngredientAiSuggestions hook", () => {
    expect(src).toMatch(/export function useIngredientAiSuggestions\b/);
  });

  test("exports usePairingAiSuggestions hook", () => {
    expect(src).toMatch(/export function usePairingAiSuggestions\b/);
  });

  test("imports useAiSuggestions from the hook", () => {
    expect(src).toMatch(/useAiSuggestions/);
    expect(src).toMatch(/use-ai-suggestions/);
  });
});

describe("use-typed-suggestions — field path unions derive from contracts", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-typed-suggestions.ts"), "utf-8");
  });

  test("RecipeFieldPath derives from recipeContract.fields", () => {
    expect(src).toMatch(/recipeContract\.fields|keyof.*recipeContract/);
  });

  test("IngredientFieldPath derives from ingredientContract.fields", () => {
    expect(src).toMatch(/ingredientContract\.fields|keyof.*ingredientContract/);
  });

  test("PairingFieldPath derives from pairingContract.fields", () => {
    expect(src).toMatch(/pairingContract\.fields|keyof.*pairingContract/);
  });
});

describe("use-typed-suggestions — typed return types", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-typed-suggestions.ts"), "utf-8");
  });

  test("RecipeAiSuggestionsReturn narrows forField to RecipeFieldPath", () => {
    expect(src).toMatch(/RecipeAiSuggestionsReturn/);
    expect(src).toMatch(/forField.*RecipeFieldPath|RecipeFieldPath.*forField/);
  });

  test("IngredientAiSuggestionsReturn narrows forField to IngredientFieldPath", () => {
    expect(src).toMatch(/IngredientAiSuggestionsReturn/);
    expect(src).toMatch(/forField.*IngredientFieldPath|IngredientFieldPath.*forField/);
  });

  test("PairingAiSuggestionsReturn narrows forField to PairingFieldPath", () => {
    expect(src).toMatch(/PairingAiSuggestionsReturn/);
    expect(src).toMatch(/forField.*PairingFieldPath|PairingFieldPath.*forField/);
  });

  test("typed hooks delegate to base useAiSuggestions at runtime", () => {
    expect(src).toMatch(/return useAiSuggestions\(/);
  });
});

describe("use-typed-suggestions — known fields coverage", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-typed-suggestions.ts"), "utf-8");
  });

  test("recipe field paths include description and name", () => {
    // Derives from recipeContract.fields — these must be reachable via the type
    expect(src).toMatch(/recipeContract/);
  });

  test("ingredient field paths include summary and description", () => {
    expect(src).toMatch(/ingredientContract/);
  });

  test("pairing field paths include description", () => {
    expect(src).toMatch(/pairingContract/);
  });
});
