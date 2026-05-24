import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { InlineFieldSuggestion } from "@/components/admin/InlineFieldSuggestion.tsx";
import { useFieldContext } from "./form-context.ts";

interface TextareaFieldProps {
  /** Rendered as a <Label>. Omit to skip the label element entirely. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  /** AI contract field key. When set an InlineFieldSuggestion is rendered. */
  suggestionPath?: string;
  /** Extra node rendered below the textarea (e.g. a hint paragraph). */
  hint?: React.ReactNode;
  className?: string;
}

export function TextareaField({
  label,
  placeholder,
  disabled,
  rows,
  suggestionPath,
  hint,
  className,
}: TextareaFieldProps) {
  const field = useFieldContext<string>();
  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={field.name}>{label}</Label>}
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
