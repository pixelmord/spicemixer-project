import TagInput from "@/components/admin/TagInput.tsx";
import { Label } from "@/components/ui/label.tsx";
import { InlineFieldSuggestion } from "@/components/admin/InlineFieldSuggestion.tsx";
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
  /** AI contract field key. Enables AiFieldSuggestButton + InlineFieldSuggestion(kind="array"). */
  suggestionPath?: string;
  /**
   * Items from a batch AI suggest call (e.g. from a custom runProposeTags action).
   * When provided, shows InlineArraySuggestion below the input.
   */
  pendingItems?: string[] | null;
  /** Called when the user accepts one or more pendingItems. Merge into field value. */
  onAcceptItems?: (items: string[]) => void;
  /** Called when the user dismisses pendingItems. */
  onDismissItems?: () => void;
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
  pendingItems,
  onAcceptItems,
  onDismissItems,
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
        <InlineFieldSuggestion
          fieldPath={suggestionPath}
          currentValue={currentValue}
          onApply={(v) => {
            if (Array.isArray(v)) {
              const merged = [...new Set([...currentValue, ...v.map(String)])];
              field.handleChange(merged);
            }
          }}
          kind="array"
        />
      )}
      {pendingItems && pendingItems.length > 0 && onAcceptItems && onDismissItems && (
        <InlineArraySuggestion
          items={pendingItems}
          existingItems={currentValue}
          onAccept={(items) => {
            const merged = [...new Set([...currentValue, ...items])];
            field.handleChange(merged);
            onAcceptItems(items);
          }}
          onDismiss={onDismissItems}
        />
      )}
      {hint}
    </div>
  );
}
