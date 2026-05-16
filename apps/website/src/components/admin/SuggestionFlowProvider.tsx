import { createContext, useContext } from "react";
import type { UseAiSuggestionsReturn } from "@/hooks/use-ai-suggestions";

const SuggestionFlowContext = createContext<UseAiSuggestionsReturn | null>(null);

interface SuggestionFlowProviderProps {
  value: UseAiSuggestionsReturn;
  children: React.ReactNode;
}

export function SuggestionFlowProvider({ value, children }: SuggestionFlowProviderProps) {
  return <SuggestionFlowContext.Provider value={value}>{children}</SuggestionFlowContext.Provider>;
}

export function useSuggestionFlowContext(): UseAiSuggestionsReturn {
  const ctx = useContext(SuggestionFlowContext);
  if (!ctx) {
    throw new Error("useSuggestionFlowContext must be used within SuggestionFlowProvider");
  }
  return ctx;
}
