import { useState } from "react";
import { cn } from "../lib/utils";

// ── InlineArraySuggestion ──────────────────────────────────────────────────────
//
// Standalone, context-free "pick some / all / none" affordance for a proposed
// list of string items. Use inside field components (e.g. TagInputField) when
// you want the batch-suggestion UX without requiring SuggestionFlowProvider.
//
// Items already present in `existingItems` are filtered out automatically.
// Individual chip clicks call onAccept([item]); "Add all" calls onAccept with
// every remaining item; "Dismiss" calls onDismiss.

export interface InlineArraySuggestionProps {
  /** The proposed items to display. */
  items: string[];
  /** Items already in the field value — these are hidden from suggestions. */
  existingItems?: string[];
  /** Called when the user accepts one or more items (additive merge is the caller's job). */
  onAccept: (items: string[]) => void;
  /** Called when the user dismisses all suggestions. */
  onDismiss: () => void;
  /** Optional label shown above the pills, e.g. "AI suggestions". */
  label?: string;
  className?: string;
}

export function InlineArraySuggestion({
  items,
  existingItems = [],
  onAccept,
  onDismiss,
  label,
  className,
}: InlineArraySuggestionProps) {
  const available = items.filter((item) => !existingItems.includes(item));
  const [locallyAdded, setLocallyAdded] = useState<Set<string>>(new Set());

  const remaining = available.filter((item) => !locallyAdded.has(item));

  // Renders nothing when the original items list is empty or everything is already present.
  if (items.length === 0 || available.length === 0) return null;

  function acceptOne(item: string) {
    setLocallyAdded((prev) => new Set([...prev, item]));
    onAccept([item]);
  }

  function acceptAll() {
    onAccept(remaining.length > 0 ? remaining : available);
  }

  return (
    <div className={cn("rounded-md border p-2 text-sm mt-1.5", className)}>
      {label && <p className="mb-1 text-xs text-muted-foreground">{label}</p>}
      <div className="flex flex-wrap gap-1">
        {remaining.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => acceptOne(item)}
            className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
          >
            + {item}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={acceptAll}
          className="text-xs text-muted-foreground hover:text-foreground px-1"
        >
          Add all
        </button>
        <button
          type="button"
          onClick={() => onDismiss()}
          className="text-xs text-muted-foreground hover:text-foreground px-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
