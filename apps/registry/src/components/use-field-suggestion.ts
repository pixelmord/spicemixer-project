import { useEffect } from "react";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import type { FieldSuggestion, PerFieldAccessor } from "./use-ai-suggestions";

// Bundled flow-wiring for a single field. Used by the per-kind Inline*Suggestion
// components (text, array, enum, multi-enum, date, choice) so they all share the
// same accept/reject/markViewed/retranslate plumbing without re-implementing it.
//
// Why a hook (and not a wrapper component): keeps each per-kind component a
// single function call away from its presentational row, with typed value and
// per-kind props at the call site. There is no dispatcher and no renderer map.

export interface UseFieldSuggestionResult {
  /** Raw suggestion from the flow context. undefined when nothing pending. */
  suggestion: FieldSuggestion | undefined;
  accessor: PerFieldAccessor;
  /** True for "single" suggestions; false/undefined for "choice" or absent. */
  isSingle: boolean;
  /** True when a Retranslate affordance should be shown for translatable fields. */
  showRetranslate: boolean;
}

export function useFieldSuggestion(fieldPath: string): UseFieldSuggestionResult {
  const flow = useSuggestionFlowContext();
  const accessor = flow.forField(fieldPath);
  const suggestion = accessor.suggestion;

  // Mark suggestion as viewed once it is in scope. Keyed on a value that
  // changes per suggestion identity so re-renders of unchanged suggestions
  // don't re-trigger markViewed.
  let suggestionKey: string | null = null;
  if (suggestion?.kind === "single") suggestionKey = suggestion.hash;
  else if (suggestion) suggestionKey = suggestion.traceId;

  useEffect(() => {
    if (suggestionKey !== null) {
      flow.forField(fieldPath).markViewed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldPath, suggestionKey]);

  const showRetranslate =
    accessor.sourceLocale !== undefined &&
    accessor.translationMode !== undefined &&
    accessor.translationMode !== "copy" &&
    accessor.translationMode !== "skip";

  return {
    suggestion,
    accessor,
    isSingle: suggestion?.kind === "single",
    showRetranslate,
  };
}
