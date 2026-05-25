import { cn } from "../lib/utils";

interface RetranslateButtonProps {
  sourceLocale: string;
  isStale: boolean;
  onRetranslate: () => void;
  className?: string;
}

export function RetranslateButton({
  sourceLocale,
  isStale,
  onRetranslate,
  className,
}: RetranslateButtonProps) {
  return (
    <button
      type="button"
      data-stale={isStale ? "true" : undefined}
      onClick={onRetranslate}
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs",
        isStale
          ? "bg-amber-100 font-medium text-amber-800 hover:bg-amber-200"
          : "text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      Retranslate from {sourceLocale}
    </button>
  );
}
