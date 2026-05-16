import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { AcceptRejectButtons } from "./accept-reject-buttons";

interface DateSuggestionRowProps {
  value: string;
  confidence?: "high" | "medium" | "low";
  summary?: string;
  readOnly?: boolean;
  onApply?: (value: string) => void;
  onReject?: () => void;
  className?: string;
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function DateSuggestionRow({
  value,
  confidence,
  summary,
  readOnly = false,
  onApply,
  onReject,
  className,
}: DateSuggestionRowProps) {
  return (
    <div
      className={cn("flex items-start gap-2 rounded-md border p-2 text-sm", className)}
      data-readonly={readOnly}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{formatDate(value)}</p>
        {summary && <p className="mt-0.5 text-xs text-stone-500">{summary}</p>}
      </div>
      {confidence && <ConfidenceBadge confidence={confidence} />}
      {!readOnly && onApply && onReject && (
        <AcceptRejectButtons onAccept={() => onApply(value)} onReject={onReject} />
      )}
    </div>
  );
}
