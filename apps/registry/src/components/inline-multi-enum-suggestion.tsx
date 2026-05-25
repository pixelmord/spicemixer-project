import { useFieldSuggestion } from "./use-field-suggestion";
import { MultiEnumSuggestionRow } from "./multi-enum-suggestion-row";
import { ChoiceSuggestionBlock } from "./choice-suggestion-block";
import { RetranslateButton } from "./retranslate-button";
import { SuggestionLayout } from "./suggestion-layout";

export interface InlineMultiEnumSuggestionProps {
  fieldPath: string;
  options: string[];
  onApply: (values: string[]) => void;
  sourceSlot?: React.ReactNode;
  className?: string;
}

export function InlineMultiEnumSuggestion({
  fieldPath,
  options,
  onApply,
  sourceSlot,
  className,
}: InlineMultiEnumSuggestionProps) {
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

  if (suggestion.kind === "choice") {
    return (
      <SuggestionLayout
        sourceSlot={sourceSlot}
        retranslateSlot={retranslateSlot}
        className={className}
      >
        <ChoiceSuggestionBlock
          suggestion={suggestion}
          onApply={(v) => onApply(Array.isArray(v) ? v.map(String) : [])}
          accessor={accessor}
        />
      </SuggestionLayout>
    );
  }

  const values = Array.isArray(suggestion.value) ? suggestion.value.map(String) : [];

  return (
    <SuggestionLayout
      sourceSlot={sourceSlot}
      retranslateSlot={retranslateSlot}
      className={className}
    >
      <MultiEnumSuggestionRow
        values={values}
        options={options}
        confidence={suggestion.confidence}
        summary={suggestion.summary}
        onApply={(vals) => {
          onApply(vals);
          accessor.recordAccept(suggestion.hash, vals);
        }}
        onReject={() => accessor.recordReject(suggestion.hash)}
      />
    </SuggestionLayout>
  );
}
