import { useState } from "react";
import { Loader2, Sparkles, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { FileTextPromptSourcePicker } from "./FileTextPromptSourcePicker.tsx";
import { SuggestionsOptions } from "./SuggestionsOptions.tsx";
import { SuggestionFlowProvider } from "./SuggestionFlowProvider.tsx";
import type { SourceShape } from "./FileTextPromptSourcePicker.tsx";
import type { AiPreset, UseAiSuggestionsReturn } from "@/hooks/use-ai-suggestions.tsx";

export type { SourceShape };

export interface IngestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Presets for SuggestionsOptions. Requires flow — ignored when flow is not provided. */
  presets?: AiPreset[];
  /**
   * Flow from useAiSuggestions. When provided:
   * - Wraps content in SuggestionFlowProvider.
   * - Shows SuggestionsOptions (without its own Run button) above the Generate button.
   */
  flow?: UseAiSuggestionsReturn;
  /**
   * Called with the selected source when the user clicks Generate.
   * Consumer is responsible for triggering the AI call (e.g. flow.run() or an Astro action).
   */
  onRun: (source: SourceShape) => Promise<void>;
  /**
   * Post-run review body — rendered after onRun resolves.
   * When omitted the dialog closes instead of showing a review phase.
   */
  reviewChildren?: React.ReactNode;
  /**
   * Called when the user clicks "Try different source" in the review phase.
   * Use to reset any state derived from the previous run (e.g. clear proposed data).
   */
  onReviewBack?: () => void;
  /** Label for the generate button. Defaults to "Generate". */
  generateLabel?: string;
  className?: string;
}

type Phase = "source" | "review";

function IngestDialogContent({
  onOpenChange,
  title,
  presets = [],
  flow,
  onRun,
  reviewChildren,
  onReviewBack,
  generateLabel = "Generate",
  className,
}: Omit<IngestDialogProps, "open">) {
  const [source, setSource] = useState<SourceShape | null>(null);
  const [phase, setPhase] = useState<Phase>("source");
  const [isRunning, setIsRunning] = useState(false);

  const running = isRunning || (flow?.isRunning ?? false);
  const hasReviewPhase = onReviewBack !== undefined || reviewChildren !== undefined;

  async function handleGenerate() {
    if (!source) return;
    setIsRunning(true);
    try {
      await onRun(source);
      if (hasReviewPhase) {
        setPhase("review");
      } else {
        onOpenChange(false);
      }
    } catch {
      // Consumer is responsible for error reporting (e.g. toast);
      // stay on source phase so the user can retry.
    } finally {
      setIsRunning(false);
    }
  }

  function handleBack() {
    setPhase("source");
    setSource(null);
    onReviewBack?.();
  }

  return (
    <DialogContent className={cn("sm:max-w-xl", className)} showCloseButton>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          {title ?? "Ingest content"}
        </DialogTitle>
      </DialogHeader>

      {phase === "source" && (
        <div className="space-y-4">
          <FileTextPromptSourcePicker onChange={setSource} />

          {flow && presets.length > 0 && (
            <SuggestionsOptions presets={presets} showRunButton={false} />
          )}

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!source || running}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={14} />
                {generateLabel}
              </>
            )}
          </button>
        </div>
      )}

      {phase === "review" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={14} />
            Try different source
          </button>
          {reviewChildren}
        </div>
      )}
    </DialogContent>
  );
}

export function IngestDialog(props: IngestDialogProps) {
  const { open, onOpenChange, flow, ...rest } = props;

  const dialog = (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <IngestDialogContent onOpenChange={onOpenChange} flow={flow} {...rest} />
    </Dialog>
  );

  if (flow) {
    return <SuggestionFlowProvider value={flow}>{dialog}</SuggestionFlowProvider>;
  }

  return dialog;
}
