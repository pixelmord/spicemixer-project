import { cn } from "../lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { AcceptRejectButtons } from "./accept-reject-buttons";

interface MultiEnumSuggestionRowProps {
  values: string[];
  options: string[];
  confidence?: "high" | "medium" | "low";
  summary?: string;
  readOnly?: boolean;
  onApply?: (values: string[]) => void;
  onReject?: () => void;
  className?: string;
}

export function MultiEnumSuggestionRow({
  values,
  options: _options,
  confidence,
  summary,
  readOnly = false,
  onApply,
  onReject,
  className,
}: MultiEnumSuggestionRowProps) {
  return (
    <div
      className={cn("flex items-start gap-2 rounded-md border p-2 text-sm", className)}
      data-readonly={readOnly}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
            >
              {v}
            </span>
          ))}
        </div>
        {summary && <p className="mt-1 text-xs text-stone-500">{summary}</p>}
      </div>
      {confidence && <ConfidenceBadge confidence={confidence} />}
      {!readOnly && onApply && onReject && (
        <AcceptRejectButtons onAccept={() => onApply(values)} onReject={onReject} />
      )}
    </div>
  );
}
