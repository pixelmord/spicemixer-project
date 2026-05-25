import { useState } from "react";
import { cn } from "../lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { AcceptRejectButtons } from "./accept-reject-buttons";
import type { FieldSuggestion, PerFieldAccessor } from "./use-ai-suggestions";

type ChoiceFieldSuggestion = Extract<FieldSuggestion, { kind: "choice" }>;

interface ChoiceSuggestionBlockProps {
  suggestion: ChoiceFieldSuggestion;
  onApply: (value: unknown) => void;
  accessor: PerFieldAccessor;
  className?: string;
}

export function ChoiceSuggestionBlock({
  suggestion,
  onApply,
  accessor,
  className,
}: ChoiceSuggestionBlockProps) {
  const isMulti = typeof suggestion.choose !== "number";
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!isMulti) {
    return (
      <div className={cn("space-y-1 rounded-md border p-2 text-sm", className)}>
        <p className="mb-1 text-xs text-stone-500">Choose one:</p>
        {suggestion.candidates.map((candidate) => (
          <div key={candidate.hash} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-words">{String(candidate.value)}</span>
            {candidate.confidence && <ConfidenceBadge confidence={candidate.confidence} />}
            <AcceptRejectButtons
              onAccept={() => {
                onApply(candidate.value);
                accessor.recordAccept(candidate.hash, candidate.value);
              }}
              onReject={() => accessor.recordReject(candidate.hash)}
            />
          </div>
        ))}
      </div>
    );
  }

  const { min, max } =
    typeof suggestion.choose === "object" ? suggestion.choose : { min: 1, max: 1 };
  return (
    <div className={cn("space-y-1 rounded-md border p-2 text-sm", className)}>
      <p className="mb-1 text-xs text-stone-500">
        Choose {min}–{max}:
      </p>
      {suggestion.candidates.map((candidate) => (
        <label key={candidate.hash} className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={selected.has(candidate.hash)}
            onChange={(e) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(candidate.hash);
                else next.delete(candidate.hash);
                return next;
              });
            }}
          />
          <span className="min-w-0 flex-1 break-words">{String(candidate.value)}</span>
          {candidate.confidence && <ConfidenceBadge confidence={candidate.confidence} />}
        </label>
      ))}
      <div className="flex gap-1 pt-1">
        <button
          type="button"
          disabled={selected.size < min}
          onClick={() => {
            const chosen = suggestion.candidates.filter((c) => selected.has(c.hash));
            onApply(chosen.map((c) => c.value));
            for (const c of chosen) {
              accessor.recordAccept(c.hash, c.value);
            }
          }}
          className="inline-flex items-center rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Apply selected
        </button>
        <button
          type="button"
          onClick={() => accessor.recordReject()}
          className="inline-flex items-center rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
        >
          Reject all
        </button>
      </div>
    </div>
  );
}
