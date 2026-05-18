import {
  useAiSuggestions,
  type UseAiSuggestionsInput,
  type UseAiSuggestionsReturn,
  type PerFieldAccessor,
} from "@/hooks/use-ai-suggestions.tsx";
import { recipeContract } from "@/contracts/recipeContract.ts";
import { ingredientContract } from "@/contracts/ingredientContract.ts";
import { pairingContract } from "@/contracts/pairingContract.ts";

// Field path unions derived from each kind's contract — typos become TS errors at callsites.
export type RecipeFieldPath = keyof typeof recipeContract.fields;
export type IngredientFieldPath = keyof typeof ingredientContract.fields;
export type PairingFieldPath = keyof typeof pairingContract.fields;

// Typed return types narrowing forField's parameter to each kind's known fields.
export interface RecipeAiSuggestionsReturn extends Omit<UseAiSuggestionsReturn, "forField"> {
  forField(field: RecipeFieldPath): PerFieldAccessor;
}

export interface IngredientAiSuggestionsReturn extends Omit<UseAiSuggestionsReturn, "forField"> {
  forField(field: IngredientFieldPath): PerFieldAccessor;
}

export interface PairingAiSuggestionsReturn extends Omit<UseAiSuggestionsReturn, "forField"> {
  forField(field: PairingFieldPath): PerFieldAccessor;
}

export function useRecipeAiSuggestions(input: UseAiSuggestionsInput): RecipeAiSuggestionsReturn {
  return useAiSuggestions(input) as unknown as RecipeAiSuggestionsReturn;
}

export function useIngredientAiSuggestions(
  input: UseAiSuggestionsInput,
): IngredientAiSuggestionsReturn {
  return useAiSuggestions(input) as unknown as IngredientAiSuggestionsReturn;
}

export function usePairingAiSuggestions(input: UseAiSuggestionsInput): PairingAiSuggestionsReturn {
  return useAiSuggestions(input) as unknown as PairingAiSuggestionsReturn;
}
