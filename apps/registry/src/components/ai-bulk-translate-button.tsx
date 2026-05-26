import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import type { AiContract } from "./use-ai-suggestions";

export type BulkTranslateWritePolicy = "fill-gaps" | "replace-all";

const LS_KEY = "spicemixer.bulkTranslateWritePolicy";

function loadPolicy(): BulkTranslateWritePolicy {
  try {
    const stored = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (stored === "replace-all") return "replace-all";
  } catch {}
  return "fill-gaps";
}

function savePolicy(policy: BulkTranslateWritePolicy) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, policy);
  } catch {}
}

interface AiBulkTranslateButtonProps {
  contract: AiContract;
  /** Current form values; used to determine empty fields for fill-gaps policy */
  currentData?: Record<string, unknown>;
  className?: string;
}

export function AiBulkTranslateButton({
  contract,
  currentData,
  className,
}: AiBulkTranslateButtonProps) {
  const flow = useSuggestionFlowContext();
  const [policy, setPolicyState] = useState<BulkTranslateWritePolicy>(loadPolicy);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const pendingCount = flow.suggestions.size;

  const allTranslatableFields = Object.entries(contract.fields)
    .filter(([, cfg]) => cfg.translation?.mode !== "skip" && cfg.translation?.mode !== "copy")
    .map(([k]) => k);

  const emptyFields = allTranslatableFields.filter(
    (f) => !currentData || currentData[f] == null || currentData[f] === "",
  );

  function setPolicy(p: BulkTranslateWritePolicy) {
    setPolicyState(p);
    savePolicy(p);
    setDropdownOpen(false);
  }

  async function handleRun() {
    setDropdownOpen(false);
    const target = policy === "fill-gaps" ? emptyFields : allTranslatableFields;
    if (target.length === 0) return;
    await flow.runTranslation({ target });
  }

  const primaryLabel =
    policy === "fill-gaps" ? "Translate missing fields" : "Re-translate all fields";

  if (flow.isRunning) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium opacity-60",
          className,
        )}
      >
        <Loader2 size={14} className="animate-spin" />
        Translating…
      </button>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={() => flow.acceptAll()}
        className={cn(
          "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity",
          className,
        )}
      >
        Apply all ({pendingCount})
      </button>
    );
  }

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => void handleRun()}
        className="inline-flex items-center rounded-l-md border border-r-0 bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        aria-label="Translation options"
        onClick={() => setDropdownOpen((v) => !v)}
        className="inline-flex items-center rounded-r-md border bg-primary px-2 py-1.5 text-sm text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <ChevronDown size={14} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[10rem] rounded-md border bg-popover shadow-md">
          <button
            type="button"
            onClick={() => setPolicy("fill-gaps")}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
              policy === "fill-gaps" && "font-medium text-primary",
            )}
          >
            Translate missing fields
          </button>
          <button
            type="button"
            onClick={() => setPolicy("replace-all")}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
              policy === "replace-all" && "font-medium text-primary",
            )}
          >
            Re-translate all fields
          </button>
        </div>
      )}
    </div>
  );
}
