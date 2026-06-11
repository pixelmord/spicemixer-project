import { Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import { SuggestionsOverview, type OverviewField } from "./suggestions-overview";

interface AiBulkSuggestButtonProps {
  className?: string;
  /**
   * When provided, the button becomes a suggestions overview dropdown over
   * these fields — listing which got new suggestions (with a link to each) and
   * which did not — instead of a bare "Accept all" badge. This is the
   * preferred surface: it never hides a run that only produced array-field or
   * all-duplicate suggestions.
   */
  overviewFields?: OverviewField[];
}

export function AiBulkSuggestButton({ className, overviewFields }: AiBulkSuggestButtonProps) {
  const flow = useSuggestionFlowContext();

  if (overviewFields) {
    return <SuggestionsOverview fields={overviewFields} className={className} />;
  }

  const pendingCount = flow.suggestions.size;

  if (flow.isRunning) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium opacity-60",
          className,
        )}
      >
        <Loader2 size={14} className="animate-spin" />
        Running…
      </button>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={() => flow.acceptAll()}
        className={cn(
          "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity",
          className,
        )}
      >
        <Sparkles size={14} />
        Accept all ({pendingCount})
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void flow.run()}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors",
        className,
      )}
    >
      <Sparkles size={14} />
      Get AI suggestions
    </button>
  );
}
