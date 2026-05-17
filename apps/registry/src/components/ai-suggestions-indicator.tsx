import { useState } from "react";
import { Loader2, Sparkles, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import { SuggestionsOptions } from "./suggestions-options";
import type { AiPreset } from "./use-ai-suggestions";

interface AiSuggestionsIndicatorProps {
  presets: AiPreset[];
  className?: string;
}

export function AiSuggestionsIndicator({ presets, className }: AiSuggestionsIndicatorProps) {
  const flow = useSuggestionFlowContext();
  const [optionsOpen, setOptionsOpen] = useState(false);

  const pendingCount = flow.suggestions.size;
  const autoAppliedCount = flow.autoApplied.size;
  const hasActivity = pendingCount > 0 || autoAppliedCount > 0;

  return (
    <div className={cn("rounded-md border bg-card p-3 space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {flow.isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Running…</span>
            </>
          ) : hasActivity ? (
            <>
              <Sparkles size={14} className="shrink-0 text-primary" />
              <StatusText pendingCount={pendingCount} autoAppliedCount={autoAppliedCount} />
            </>
          ) : (
            <button
              type="button"
              onClick={() => void flow.run()}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Sparkles size={13} />
              Get AI suggestions
            </button>
          )}
        </div>

        <button
          type="button"
          aria-label="Options"
          onClick={() => setOptionsOpen((prev) => !prev)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings2 size={14} />
        </button>
      </div>

      {optionsOpen && <SuggestionsOptions presets={presets} className="border-t pt-2" />}
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

function StatusText({
  pendingCount,
  autoAppliedCount,
}: {
  pendingCount: number;
  autoAppliedCount: number;
}) {
  if (pendingCount > 0 && autoAppliedCount > 0) {
    return (
      <span className="text-sm text-foreground">
        {autoAppliedCount} auto-applied · {pendingCount} to review
      </span>
    );
  }

  if (pendingCount > 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {plural(pendingCount, "suggestion")} to review across {plural(pendingCount, "field")} —
        review in place
      </span>
    );
  }

  return <span className="text-sm text-muted-foreground">{autoAppliedCount} auto-applied</span>;
}
