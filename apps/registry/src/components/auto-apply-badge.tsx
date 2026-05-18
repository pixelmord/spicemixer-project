import { RotateCcw } from "lucide-react";
import { cn } from "../lib/utils";

interface AutoApplyBadgeProps {
  summary: string;
  hash: string;
  onRevert: () => void;
  reverted?: boolean;
  className?: string;
}

export function AutoApplyBadge({
  summary,
  hash,
  onRevert,
  reverted = false,
  className,
}: AutoApplyBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700",
        reverted && "opacity-50 line-through",
        className,
      )}
      title={`Hash: ${hash}`}
    >
      <span className="truncate max-w-[180px]">{summary}</span>
      {!reverted && (
        <button
          type="button"
          onClick={onRevert}
          aria-label="Revert auto-applied change"
          className="ml-0.5 rounded p-0.5 hover:bg-blue-100"
        >
          <RotateCcw size={10} />
        </button>
      )}
    </span>
  );
}
