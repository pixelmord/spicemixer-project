import type { ReactNode } from "react";
import { useFieldSuggestion } from "@registry/components/use-field-suggestion";
import { AcceptRejectButtons } from "@registry/components/accept-reject-buttons";
import { RetranslateButton } from "@registry/components/retranslate-button";
import { ConfidenceBadge } from "@registry/components/confidence-badge";

// Inline suggestion panel for ordered-list fields (recipeIngredient, recipeInstructions).
// Semantics: REPLACE the whole list (not additive like TagsSuggestionRow).
// The translate button lives in the section header; this panel surfaces the result.

interface InlineListSuggestionProps {
  fieldPath: string;
  /** Called with the full translated list when the user accepts. */
  onApply: (items: unknown[]) => void;
  /** Renders one item from the suggested list. */
  renderItem: (item: unknown, index: number) => ReactNode;
  className?: string;
}

export function InlineListSuggestion({
  fieldPath,
  onApply,
  renderItem,
  className,
}: InlineListSuggestionProps) {
  const { suggestion, accessor, showRetranslate } = useFieldSuggestion(fieldPath);

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

  const isSingle = suggestion.kind === "single";
  const items: unknown[] =
    isSingle && Array.isArray(suggestion.value) ? (suggestion.value as unknown[]) : [];
  const confidence = isSingle ? suggestion.confidence : undefined;
  const summary = isSingle ? suggestion.summary : undefined;

  function handleAccept() {
    onApply(items);
    if (suggestion!.kind === "single") {
      accessor.recordAccept(suggestion!.hash, items);
    }
  }

  function handleReject() {
    if (suggestion!.kind === "single") {
      accessor.recordReject(suggestion!.hash);
    }
  }

  return (
    <div className={`rounded-md border p-2 space-y-1.5 text-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {items.length} translated item{items.length !== 1 ? "s" : ""}
          {confidence && <ConfidenceBadge confidence={confidence} className="ml-1.5" />}
        </span>
        <AcceptRejectButtons onAccept={handleAccept} onReject={handleReject} />
      </div>
      {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
      <ol className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs pl-2">
            <span className="text-muted-foreground mr-1">{i + 1}.</span>
            {renderItem(item, i)}
          </li>
        ))}
      </ol>
      {showRetranslate && (
        <div className="pt-1 border-t border-border">
          <RetranslateButton
            sourceLocale={accessor.sourceLocale!}
            isStale={accessor.isStale}
            onRetranslate={() => void accessor.retranslate()}
          />
        </div>
      )}
    </div>
  );
}
