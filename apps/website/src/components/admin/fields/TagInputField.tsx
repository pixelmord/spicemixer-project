import TagInput from "@/components/admin/TagInput.tsx";
import { Label } from "@/components/ui/label.tsx";
import { AiFieldSuggestButton } from "@registry/components/ai-field-suggest-button";
import { InlineArraySuggestion } from "@registry/components/inline-array-suggestion";

// Minimal duck-type matching the TanStack Form field render-prop object for string[] fields.
// Usage: <form.Field name="tags">{(field) => <TagInputField field={field} ... />}</form.Field>
interface FieldApi {
  name: string;
  state: { value: string[] | undefined };
  handleChange: (value: string[]) => void;
  handleBlur: () => void;
}

export interface TagInputFieldProps {
  field: FieldApi;
  /** Rendered as a <Label>. Accepts ReactNode so callers can inline hints. */
  label?: React.ReactNode;
  placeholder?: string;
  /** Passed to TagInput for inline autocomplete suggestions. */
  suggestions?: string[];
  /** AI contract field key. Enables AiFieldSuggestButton + InlineArraySuggestion. */
  suggestionPath?: string;
  /** Extra node rendered below the input, e.g. a hint paragraph. */
  hint?: React.ReactNode;
  className?: string;
}

export function TagInputField({
  field,
  label,
  placeholder,
  suggestions,
  suggestionPath,
  hint,
  className,
}: TagInputFieldProps) {
  const currentValue = field.state.value ?? [];
  const showAiButtons = !!suggestionPath;
  const showLabelRow = !!label || showAiButtons;

  return (
    <div className="space-y-1.5">
      {showLabelRow && (
        <div className={`flex items-center ${label ? "justify-between" : "justify-end"}`}>
          {label && <Label htmlFor={field.name}>{label}</Label>}
          {showAiButtons && (
            <div className="flex items-center gap-1">
              <AiFieldSuggestButton fieldPath={suggestionPath} />
            </div>
          )}
        </div>
      )}
      <TagInput
        value={currentValue}
        onChange={(tags) => field.handleChange(tags)}
        suggestions={suggestions}
        placeholder={placeholder}
        className={className}
      />
      {suggestionPath && (
        <InlineArraySuggestion
          fieldPath={suggestionPath}
          existingItems={currentValue}
          onApply={(items) => {
            const merged = [...new Set([...currentValue, ...items])];
            field.handleChange(merged);
          }}
        />
      )}
      {hint}
    </div>
  );
}
