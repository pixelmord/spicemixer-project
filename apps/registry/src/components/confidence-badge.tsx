import { cn } from "../lib/utils";

interface ConfidenceBadgeProps {
  confidence: "high" | "medium" | "low";
  className?: string;
}

const variantClasses = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
} as const;

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantClasses[confidence],
        className,
      )}
      aria-label={`${confidence} confidence`}
    >
      {confidence}
    </span>
  );
}
