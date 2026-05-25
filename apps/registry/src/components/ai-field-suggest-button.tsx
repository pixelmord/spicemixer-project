import { useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import { UserPromptField } from "./user-prompt-field";

interface AiFieldSuggestButtonProps {
  /** The field path this button targets */
  fieldPath: string;
  className?: string;
}

export function AiFieldSuggestButton({ fieldPath, className }: AiFieldSuggestButtonProps) {
  const flow = useSuggestionFlowContext();
  const accessor = flow.forField(fieldPath);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  function handleDropdownClose() {
    setDropdownOpen(false);
    setCustomPrompt("");
  }

  async function handleSubmitCustomPrompt() {
    handleDropdownClose();
    flow.setUserPrompt(customPrompt);
    await accessor.run();
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
        onClick={() => void accessor.run()}
        className="inline-flex items-center gap-1.5 rounded-l-md border border-r-0 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Sparkles size={12} />
        AI suggest
      </button>
      <button
        type="button"
        aria-label="Custom prompt options"
        onClick={() => setDropdownOpen((v) => !v)}
        className="inline-flex items-center rounded-r-md border px-1.5 py-1 text-xs text-foreground hover:bg-muted transition-colors"
      >
        <ChevronDown size={12} />
      </button>

      {dropdownOpen && (
        <div
          className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border bg-popover p-3 shadow-md"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) handleDropdownClose();
          }}
        >
          <UserPromptField
            value={customPrompt}
            onChange={setCustomPrompt}
            label="Custom instructions"
            placeholder="Add instructions for this field…"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleDropdownClose}
              className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitCustomPrompt()}
              className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
