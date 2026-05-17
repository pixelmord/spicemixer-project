import { cn } from "@/lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import { PresetPicker } from "./preset-picker";
import { UserPromptField } from "./user-prompt-field";
import { WritePolicyPicker } from "./write-policy-picker";
import type { AiPreset } from "./use-ai-suggestions";

interface SuggestionsOptionsProps {
  presets: AiPreset[];
  /** Set to false when embedding inside IngestDialog which provides its own Generate button */
  showRunButton?: boolean;
  className?: string;
}

export function SuggestionsOptions({
  presets,
  showRunButton = true,
  className,
}: SuggestionsOptionsProps) {
  const flow = useSuggestionFlowContext();

  return (
    <div className={cn("space-y-3", className)}>
      {presets.length > 0 && (
        <PresetPicker presets={presets} value={flow.preset} onSelect={flow.setPreset} />
      )}
      <UserPromptField value={flow.userPrompt} onChange={flow.setUserPrompt} />
      <WritePolicyPicker value={flow.writePolicy} onChange={flow.setWritePolicy} />
      {showRunButton && (
        <button
          type="button"
          onClick={() => void flow.run()}
          disabled={flow.isRunning}
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {flow.isRunning ? "Running…" : "Run"}
        </button>
      )}
    </div>
  );
}
