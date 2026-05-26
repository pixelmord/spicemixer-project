import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { InlineTextSuggestion } from "@registry/components/inline-text-suggestion";
import { AiFieldSuggestButton } from "@registry/components/ai-field-suggest-button";
import { AiFieldTranslateButton } from "@registry/components/ai-field-translate-button";
import { cn } from "@/lib/utils.ts";

// Minimal duck-type matching the TanStack Form field render-prop object.
// Usage: <form.Field name="x">{(field) => <TextareaField field={field} ... />}</form.Field>
interface FieldApi {
  name: string;
  state: { value: string | undefined };
  handleChange: (value: string) => void;
  handleBlur: () => void;
}

interface TextareaFieldProps {
  field: FieldApi;
  /** Rendered as a <Label>. Omit to skip the label element entirely. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  /** AI contract field key. Enables suggest/translate buttons and InlineTextSuggestion. */
  suggestionPath?: string;
  /**
   * Controls which AI button to show.
   * - undefined / false: AiFieldSuggestButton (single-locale edit mode)
   * - true: AiFieldTranslateButton (side-by-side translate mode)
   * Also activates the two-column sibling layout when true.
   */
  splitView?: boolean;
  /** Read-only sibling locale value shown in the right column during split-view. */
  siblingValue?: unknown;
  /** Locale code for the sibling column header, e.g. "en" or "de". */
  siblingLocale?: string;
  /** Extra node rendered below the textarea, e.g. a hint paragraph. */
  hint?: React.ReactNode;
  className?: string;
}

function formatSiblingValue(value: unknown): string {
  if (Array.isArray(value)) {
    return (value as unknown[])
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(", ");
  }
  if (typeof value === "string") return value;
  if (value != null) return JSON.stringify(value);
  return "";
}

export function TextareaField({
  field,
  label,
  placeholder,
  disabled,
  rows,
  suggestionPath,
  splitView,
  siblingValue,
  siblingLocale,
  hint,
  className,
}: TextareaFieldProps) {
  const showAiButtons = !!suggestionPath;
  const showLabelRow = !!label || showAiButtons;

  const innerContent = (
    <>
      {showLabelRow && (
        <div className={`flex items-center ${label ? "justify-between" : "justify-end"}`}>
          {label && <Label htmlFor={field.name}>{label}</Label>}
          {showAiButtons && (
            <div className="flex items-center gap-1">
              {!splitView && <AiFieldSuggestButton fieldPath={suggestionPath} />}
              {splitView && <AiFieldTranslateButton fieldPath={suggestionPath} />}
            </div>
          )}
        </div>
      )}
      <Textarea
        id={field.name}
        value={field.state.value ?? ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={className}
      />
      {suggestionPath && (
        <InlineTextSuggestion
          fieldPath={suggestionPath}
          currentValue={field.state.value ?? ""}
          onApply={(v) => field.handleChange(v)}
        />
      )}
      {hint}
    </>
  );

  if (splitView) {
    const siblingDisplay = formatSiblingValue(siblingValue);
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">{innerContent}</div>
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">
            {label}
            {siblingLocale ? ` (${siblingLocale.toUpperCase()})` : ""}
          </span>
          <div
            className={cn(
              "min-h-8 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-1.5 text-sm text-muted-foreground",
              !siblingDisplay && "italic",
            )}
          >
            {siblingDisplay || <span className="text-xs opacity-60">—</span>}
          </div>
        </div>
      </div>
    );
  }

  return <div className="space-y-1.5">{innerContent}</div>;
}
