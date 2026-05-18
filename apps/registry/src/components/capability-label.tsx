import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

interface CapabilityLabelProps {
  label: string;
  running?: boolean;
  className?: string;
}

export function CapabilityLabel({ label, running = false, className }: CapabilityLabelProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-stone-600",
        running && "text-amber-700",
        className,
      )}
      aria-live="polite"
    >
      {running && <Loader2 size={12} className="animate-spin" />}
      {label}
    </span>
  );
}
