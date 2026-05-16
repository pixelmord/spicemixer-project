import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { AcceptRejectButtons } from "./accept-reject-buttons";

interface TextSuggestionRowProps {
  value: string;
  confidence?: "high" | "medium" | "low";
  summary?: string;
  readOnly?: boolean;
  onApply?: (value: string) => void;
  onReject?: () => void;
  className?: string;
}

export function TextSuggestionRow({
  value,
  confidence,
  summary,
  readOnly = false,
  onApply,
  onReject,
  className,
}: TextSuggestionRowProps) {
  return (
    <div
      className={cn("flex items-start gap-2 rounded-md border p-2 text-sm", className)}
      data-readonly={readOnly}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words">{value}</p>
        {summary && <p className="mt-0.5 text-xs text-stone-500">{summary}</p>}
      </div>
      {confidence && <ConfidenceBadge confidence={confidence} />}
      {!readOnly && onApply && onReject && (
        <AcceptRejectButtons onAccept={() => onApply(value)} onReject={onReject} />
      )}
    </div>
  );
}
