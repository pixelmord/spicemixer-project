// Shim: forwards to the replacement ai-bulk-suggest-button. The website-side
// shim survives until the cleanup slice; RecipeForm/IngredientForm continue
// to pass presets={[]} which is ignored by the new implementation.
import { AiBulkSuggestButton } from "@registry/components/ai-bulk-suggest-button";
import type { AiPreset } from "@registry/components/use-ai-suggestions";

interface AiSuggestionsIndicatorProps {
  presets: AiPreset[];
  className?: string;
}

export function AiSuggestionsIndicator({ className }: AiSuggestionsIndicatorProps) {
  return <AiBulkSuggestButton className={className} />;
}
