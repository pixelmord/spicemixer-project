import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { InlineFieldSuggestion } from "@/components/admin/InlineFieldSuggestion.tsx";
import { AiFieldSuggestButton } from "@registry/components/ai-field-suggest-button";
import { AiFieldTranslateButton } from "@registry/components/ai-field-translate-button";
import { cn } from "@/lib/utils.ts";

// Minimal duck-type matching the TanStack Form field render-prop object.
// Usage: <form.Field name="x">{(field) => <TextField field={field} ... />}</form.Field>
interface FieldApi {
  name: string;
  state: { value: string | undefined };
  handleChange: (value: string) => void;
  handleBlur: () => void;
}

interface TextFieldProps {
  field: FieldApi;
  /** Rendered as a <Label>. Omit to skip the label element entirely. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  /** AI contract field key. Enables suggest/translate buttons and InlineFieldSuggestion. */
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
  /** Extra node rendered below the input, e.g. a <RecommendedHint>. */
  hint?: React.ReactNode;
  className?: string;
  /**
   * When true, the AiFieldSuggestButton is never shown (even when !splitView).
   * Use for fields that are translate-only (e.g. name in entity forms).
   */
  hideSuggest?: boolean;
  /**
   * Optional side-effect called with the new string value on each change,
   * after field.handleChange. Use for derived state (e.g. slug generation).
   */
  onValueChange?: (value: string) => void;
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

export function TextField({
  field,
  label,
  placeholder,
  disabled,
  type = "text",
  suggestionPath,
  splitView,
  siblingValue,
  siblingLocale,
  hint,
  className,
  hideSuggest = false,
  onValueChange,
}: TextFieldProps) {
  const showAiButtons = !!suggestionPath;
  const showSuggestButton = showAiButtons && !splitView && !hideSuggest;
  const showTranslateButton = showAiButtons && !!splitView;
  const showLabelRow = !!label || showAiButtons;

  const innerContent = (
    <>
      {showLabelRow && (
        <div className={`flex items-center ${label ? "justify-between" : "justify-end"}`}>
          {label && <Label htmlFor={field.name}>{label}</Label>}
          {showAiButtons && (
            <div className="flex items-center gap-1">
              {showSuggestButton && <AiFieldSuggestButton fieldPath={suggestionPath} />}
              {showTranslateButton && <AiFieldTranslateButton fieldPath={suggestionPath} />}
            </div>
          )}
        </div>
      )}
      <Input
        id={field.name}
        type={type}
        value={field.state.value ?? ""}
        onChange={(e) => {
          field.handleChange(e.target.value);
          onValueChange?.(e.target.value);
        }}
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
