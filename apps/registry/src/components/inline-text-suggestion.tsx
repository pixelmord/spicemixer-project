import { useFieldSuggestion } from "./use-field-suggestion";
import { TextSuggestionRow } from "./text-suggestion-row";
import { ChoiceSuggestionBlock } from "./choice-suggestion-block";
import { RetranslateButton } from "./retranslate-button";
import { SuggestionLayout } from "./suggestion-layout";

export interface InlineTextSuggestionProps {
  fieldPath: string;
  onApply: (value: string) => void;
  /** Read-only sibling-locale value rendered alongside in translation flows. */
  sourceSlot?: React.ReactNode;
  /**
   * Current field value. When provided, a suggestion whose value is identical
   * to this is suppressed (same behaviour as TagsSuggestionRow for arrays).
   */
  currentValue?: string;
  className?: string;
}

export function InlineTextSuggestion({
  fieldPath,
  onApply,
  sourceSlot,
  currentValue,
  className,
}: InlineTextSuggestionProps) {
  const { suggestion, accessor, showRetranslate } = useFieldSuggestion(fieldPath);

  const retranslateSlot = showRetranslate ? (
    <div className="mt-1">
      <RetranslateButton
        sourceLocale={accessor.sourceLocale!}
        isStale={accessor.isStale}
        onRetranslate={() => void accessor.retranslate()}
      />
    </div>
  ) : null;

  if (!suggestion) {
    if (!showRetranslate) return null;
    return (
      <div className={className}>
        <RetranslateButton
          sourceLocale={accessor.sourceLocale!}
          isStale={accessor.isStale}
          onRetranslate={() => void accessor.retranslate()}
        />
      </div>
    );
  }

  // Suppress single-value suggestion when it matches the current field value.
  if (
    suggestion.kind === "single" &&
    currentValue !== undefined &&
    String(suggestion.value ?? "") === currentValue
  ) {
    if (!showRetranslate) return null;
    return (
      <div className={className}>
        <RetranslateButton
          sourceLocale={accessor.sourceLocale!}
          isStale={accessor.isStale}
          onRetranslate={() => void accessor.retranslate()}
        />
      </div>
    );
  }

  if (suggestion.kind === "choice") {
    return (
      <SuggestionLayout
        sourceSlot={sourceSlot}
        retranslateSlot={retranslateSlot}
        className={className}
      >
        <ChoiceSuggestionBlock
          suggestion={suggestion}
          onApply={(v) => onApply(String(v ?? ""))}
          accessor={accessor}
        />
      </SuggestionLayout>
    );
  }

  return (
    <SuggestionLayout
      sourceSlot={sourceSlot}
      retranslateSlot={retranslateSlot}
      className={className}
    >
      <TextSuggestionRow
        value={String(suggestion.value ?? "")}
        confidence={suggestion.confidence}
        summary={suggestion.summary}
        onApply={(v) => {
          onApply(v);
          accessor.recordAccept(suggestion.hash, v);
        }}
        onReject={() => accessor.recordReject(suggestion.hash)}
      />
    </SuggestionLayout>
  );
}
