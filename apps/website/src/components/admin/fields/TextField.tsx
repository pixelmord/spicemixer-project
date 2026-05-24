import { Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { InlineFieldSuggestion } from "@/components/admin/InlineFieldSuggestion.tsx";
import { useSuggestionFlowContext } from "@/components/admin/SuggestionFlowProvider.tsx";
import { useFieldContext } from "./form-context.ts";

interface TextFieldProps {
  /** Rendered as a <Label>. Omit to skip the label element entirely. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  /** AI contract field key. When set, renders InlineFieldSuggestion and an "AI suggest" button. */
  suggestionPath?: string;
  /** Extra node rendered below the input (e.g. <RecommendedHint>). */
  hint?: React.ReactNode;
  className?: string;
}

export function TextField({
  label,
  placeholder,
  disabled,
  type = "text",
  suggestionPath,
  hint,
  className,
}: TextFieldProps) {
  const field = useFieldContext<string>();
  const flow = useSuggestionFlowContext();

  const hasSuggestion = suggestionPath ? !!flow.forField(suggestionPath).suggestion : false;
  const showButton = !!suggestionPath && !hasSuggestion;
  const showLabelRow = !!label || showButton;

  return (
    <div className="space-y-1.5">
      {showLabelRow && (
        <div className={`flex items-center ${label ? "justify-between" : "justify-end"}`}>
          {label && <Label htmlFor={field.name}>{label}</Label>}
          {showButton && (
            <button
              type="button"
              onClick={() => void flow.run()}
              disabled={flow.isRunning}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {flow.isRunning ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Sparkles size={11} />
              )}
              AI suggest
            </button>
          )}
        </div>
      )}
      <Input
        id={field.name}
        type={type}
        value={field.state.value ?? ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {suggestionPath && (
        <InlineFieldSuggestion
          fieldPath={suggestionPath}
          currentValue={field.state.value}
          onApply={(v) => field.handleChange(String(v))}
          kind="text"
        />
      )}
      {hint}
    </div>
  );
}
