import { useFieldSuggestion } from "./use-field-suggestion";
import { EnumSuggestionRow } from "./enum-suggestion-row";
import { ChoiceSuggestionBlock } from "./choice-suggestion-block";
import { RetranslateButton } from "./retranslate-button";
import { SuggestionLayout } from "./suggestion-layout";

export interface InlineEnumSuggestionProps {
  fieldPath: string;
  /** Valid enum options for the field. */
  options: string[];
  onApply: (value: string) => void;
  sourceSlot?: React.ReactNode;
  className?: string;
}

export function InlineEnumSuggestion({
  fieldPath,
  options,
  onApply,
  sourceSlot,
  className,
}: InlineEnumSuggestionProps) {
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
      <EnumSuggestionRow
        value={String(suggestion.value ?? "")}
        options={options}
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
