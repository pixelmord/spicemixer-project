import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";

interface AiFieldTranslateButtonProps {
  /** The field path this button targets */
  fieldPath: string;
  className?: string;
}

export function AiFieldTranslateButton({ fieldPath, className }: AiFieldTranslateButtonProps) {
  const flow = useSuggestionFlowContext();
  const accessor = flow.forField(fieldPath);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mergeEnabled, setMergeEnabled] = useState(false);

  const mode = accessor.translationMode;
  const siblingLocale = accessor.sourceLocale;

  // Skip-mode fields: render nothing
  if (mode === "skip") return null;

  const isCopyMode = mode === "copy";
  const canMerge = !isCopyMode;

  const label = isCopyMode
    ? `Copy from ${siblingLocale ?? "source"}`
    : `Translate from ${siblingLocale ?? "source"}`;

  async function handleRun() {
    setDropdownOpen(false);
    await accessor.retranslate(canMerge && mergeEnabled ? { merge: true } : undefined);
  }

  if (accessor.isRunning) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium opacity-60",
          className,
        )}
      >
        <Loader2 size={12} className="animate-spin" />
        Running…
      </button>
    );
  }

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => void handleRun()}
        className="inline-flex items-center rounded-l-md border border-r-0 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        {label}
      </button>

      {canMerge && (
        <button
          type="button"
          aria-label="Merge options"
          onClick={() => setDropdownOpen((v) => !v)}
          className="inline-flex items-center rounded-r-md border px-1.5 py-1 text-xs text-foreground hover:bg-muted transition-colors"
        >
          <ChevronDown size={12} />
        </button>
      )}

      {dropdownOpen && canMerge && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[11rem] rounded-md border bg-popover shadow-md">
          <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
            <input
              type="checkbox"
              checked={mergeEnabled}
              onChange={(e) => {
                setMergeEnabled(e.target.checked);
                setDropdownOpen(false);
              }}
              className="rounded"
            />
            Merge with existing
          </label>
        </div>
      )}
    </div>
  );
}
