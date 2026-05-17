import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import { FileTextPromptSourcePicker, type IngestSource } from "./file-text-prompt-source-picker";
import { PresetPicker } from "./preset-picker";
import { UserPromptField } from "./user-prompt-field";
import { WritePolicyPicker } from "./write-policy-picker";
import { AcceptRejectButtons } from "./accept-reject-buttons";
import { ConfidenceBadge } from "./confidence-badge";
import type { AiPreset, FieldSuggestion } from "./use-ai-suggestions";

// ── Types ──────────────────────────────────────────────────────────────────────

interface IngestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: AiPreset[];
  /** Consumer wires this to their fill action. Source payload is provided. */
  onRun: (source: IngestSource) => Promise<void>;
  /** Called when the user accepts a field suggestion in the review step. */
  onApplyField?: (field: string, value: unknown) => void;
  className?: string;
}

type Step = "source" | "review";

// ── Suggestion review row ─────────────────────────────────────────────────────

function ReviewRow({
  field,
  suggestion,
  onApplyField,
}: {
  field: string;
  suggestion: FieldSuggestion;
  onApplyField?: (field: string, value: unknown) => void;
}) {
  const flow = useSuggestionFlowContext();
  const accessor = flow.forField(field);

  if (suggestion.kind === "choice") {
    return (
      <div className="flex flex-col gap-1.5 rounded-md border p-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {field}
        </span>
        <span className="text-sm text-muted-foreground italic">
          {suggestion.candidates.length} candidates — accept/reject after closing
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {field}
          </span>
          {suggestion.confidence && <ConfidenceBadge confidence={suggestion.confidence} />}
        </div>
        <p className="text-sm break-words">
          {Array.isArray(suggestion.value)
            ? suggestion.value.join(", ")
            : String(suggestion.value ?? "")}
        </p>
        {suggestion.summary && (
          <p className="text-xs text-muted-foreground">{suggestion.summary}</p>
        )}
      </div>
      <AcceptRejectButtons
        onAccept={() => {
          accessor.recordAccept(suggestion.hash, suggestion.value);
          onApplyField?.(field, suggestion.value);
        }}
        onReject={() => accessor.recordReject(suggestion.hash)}
      />
    </div>
  );
}

// ── IngestDialog ──────────────────────────────────────────────────────────────

export function IngestDialog({
  open,
  onOpenChange,
  presets,
  onRun,
  onApplyField,
  className,
}: IngestDialogProps) {
  const flow = useSuggestionFlowContext();
  const [source, setSource] = useState<IngestSource | null>(null);
  const [step, setStep] = useState<Step>("source");

  const pendingFields = [...flow.suggestions.entries()];

  function handleClose() {
    onOpenChange(false);
    setStep("source");
    setSource(null);
  }

  async function handleRun() {
    if (!source) return;
    await onRun(source);
    setStep("review");
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import content"
      className={cn("fixed inset-0 z-50 flex items-center justify-center p-4", className)}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={handleClose} />

      {/* Dialog panel */}
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-lg bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Import content</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={handleClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {step === "source" ? (
            <>
              <FileTextPromptSourcePicker value={source} onChange={setSource} />

              <div className="space-y-3 border-t pt-3">
                {presets.length > 0 && (
                  <PresetPicker presets={presets} value={flow.preset} onSelect={flow.setPreset} />
                )}
                <UserPromptField value={flow.userPrompt} onChange={flow.setUserPrompt} />
                <WritePolicyPicker value={flow.writePolicy} onChange={flow.setWritePolicy} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {pendingFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suggestions to review.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {pendingFields.length}{" "}
                    {pendingFields.length === 1 ? "suggestion" : "suggestions"} to review
                  </p>
                  {pendingFields.map(([field, sug]) => (
                    <ReviewRow
                      key={field}
                      field={field}
                      suggestion={sug}
                      onApplyField={onApplyField}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          {step === "source" ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!source || flow.isRunning}
                onClick={() => void handleRun()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {flow.isRunning ? "Running…" : "Run"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
