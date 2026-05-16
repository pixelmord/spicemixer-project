import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AcceptRejectButtonsProps {
  onAccept: () => void;
  onReject: () => void;
  disabled?: boolean;
  className?: string;
}

export function AcceptRejectButtons({
  onAccept,
  onReject,
  disabled,
  className,
}: AcceptRejectButtonsProps) {
  return (
    <div className={cn("flex gap-1", className)}>
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        aria-label="Accept"
        className="inline-flex items-center justify-center rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
      >
        <Check size={16} />
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        aria-label="Reject"
        className="inline-flex items-center justify-center rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <X size={16} />
      </button>
    </div>
  );
}
