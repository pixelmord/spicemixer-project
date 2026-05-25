import { useState } from "react";
import { cn } from "../lib/utils";
import { ConfidenceBadge } from "./confidence-badge";

interface TagsSuggestionRowProps {
  tags: string[];
  /**
   * Tags already present on the field. Filtered out of the visible chip list.
   * When all proposed tags are filtered out, an "already covered" hint is shown
   * instead of an empty row.
   */
  existingItems?: string[];
  confidence?: "high" | "medium" | "low";
  summary?: string;
  readOnly?: boolean;
  /**
   * Called with the subset of tags being applied. Fires per chip click (single-tag
   * array) for partial picks, with the full set when "Add all" is clicked, and with
   * the full set when the user has individually accepted every chip. Consumers should
   * merge into the existing field value.
   */
  onApply?: (tags: string[]) => void;
  onReject?: () => void;
  /**
   * Optional callback for partial picks. When provided, per-chip clicks call this
   * (and not onApply) so the host can distinguish "still picking" from "finalized".
   * The final chip click and "Add all" still call onApply with the full set.
   */
  onApplyPartial?: (tags: string[]) => void;
  className?: string;
}

export function TagsSuggestionRow({
  tags,
  existingItems = [],
  confidence,
  summary,
  readOnly = false,
  onApply,
  onReject,
  onApplyPartial,
  className,
}: TagsSuggestionRowProps) {
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const existingSet = new Set(existingItems);
  const candidateTags = tags.filter((t) => !existingSet.has(t));
  const remaining = candidateTags.filter((t) => !applied.has(t));

  if (tags.length === 0) return null;

  // All proposed tags are already on the field — show empty state so the user
  // knows the model ran but had nothing new to add, instead of a silent null.
  if (candidateTags.length === 0) {
    if (readOnly || !onReject) return null;
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-md border border-dashed p-2 text-sm",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">
          No new suggestions — current values already cover this.
        </p>
        <button
          type="button"
          onClick={onReject}
          className="text-xs text-muted-foreground hover:text-foreground px-1"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (readOnly || !onApply || !onReject) {
    return (
      <div
        className={cn("flex items-start gap-2 rounded-md border p-2 text-sm", className)}
        data-readonly={readOnly}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            {candidateTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
              >
                {tag}
              </span>
            ))}
          </div>
          {summary && <p className="mt-1 text-xs text-stone-500">{summary}</p>}
        </div>
        {confidence && <ConfidenceBadge confidence={confidence} />}
      </div>
    );
  }

  const applyOne = (t: string) => {
    const nextApplied = new Set([...applied, t]);
    setApplied(nextApplied);
    if (nextApplied.size === candidateTags.length) {
      onApply(candidateTags);
    } else if (onApplyPartial) {
      onApplyPartial([t]);
    } else {
      onApply([t]);
    }
  };

  return (
    <div className={cn("rounded-md border p-2 text-sm", className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            {remaining.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => applyOne(tag)}
                className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
              >
                + {tag}
              </button>
            ))}
          </div>
          {summary && <p className="mt-1 text-xs text-stone-500">{summary}</p>}
        </div>
        {confidence && <ConfidenceBadge confidence={confidence} />}
      </div>
      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={() => onApply(candidateTags)}
          className="text-xs text-muted-foreground hover:text-foreground px-1"
        >
          Add all
        </button>
        <button
          type="button"
          onClick={onReject}
          className="text-xs text-muted-foreground hover:text-foreground px-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
