export const CAPABILITY_COPY: Record<string, string> = {
  aiExtractRecipe: "Extracting recipe…",
  aiExtractIngredient: "Extracting ingredient…",
  aiExtractPairing: "Extracting pairing…",
  aiGenerateRecipe: "Generating recipe…",
  aiMergeRecipe: "Merging recipe…",
  aiMergeIngredient: "Merging ingredient…",
  aiMergePairing: "Merging pairing…",
  aiRefreshSuggestions: "Refreshing suggestions…",
  aiRefreshIngredientSuggestions: "Refreshing suggestions…",
  aiRefreshPairingSuggestions: "Refreshing suggestions…",
  aiProposeIngredientLinks: "Proposing ingredient links…",
  aiProposeTags: "Proposing tags…",
  aiProposeRecipeImprovements: "Suggesting improvements…",
  aiProposeIngredientImprovements: "Suggesting improvements…",
  aiProposeIngredientPairings: "Proposing pairings…",
  aiTranslateRecipe: "Translating recipe…",
  aiTranslateIngredient: "Translating ingredient…",
  aiTranslatePairing: "Translating pairing…",
  aiSuggestSlug: "Suggesting slug…",
  aiCreateTranslation: "Creating translation…",
  aiCreateIngredientTranslation: "Creating translation…",
};

export default function CapabilityLabel({ action }: { action: string }) {
  return <>{CAPABILITY_COPY[action] ?? "Working…"}</>;
}
