import { cn } from "@/lib/utils";
import { useSuggestionFlowContext } from "./SuggestionFlowProvider";
import { Label } from "@/components/ui/label";
import type { AiPreset } from "@/hooks/use-ai-suggestions";

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="suggestions-preset">Preset</Label>
          <select
            id="suggestions-preset"
            value={flow.preset ?? ""}
            onChange={(e) => flow.setPreset(e.target.value || undefined)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select a preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="suggestions-prompt">Custom instructions</Label>
        <textarea
          id="suggestions-prompt"
          value={flow.userPrompt}
          onChange={(e) => flow.setUserPrompt(e.target.value)}
          placeholder="Add instructions for the AI…"
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none resize-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Write policy</p>
        {(
          [
            { value: "preserve", label: "Preserve existing" },
            { value: "replace", label: "Replace everything" },
            { value: "fill-if-empty", label: "Fill gaps only" },
            { value: "merge-instructions", label: "Custom…" },
          ] as const
        ).map((policy) => (
          <label key={policy.value} className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name="write-policy"
              value={policy.value}
              checked={flow.writePolicy === policy.value}
              onChange={() => flow.setWritePolicy(policy.value)}
              className="h-4 w-4"
            />
            {policy.label}
          </label>
        ))}
      </div>

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
