import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { InlineFieldSuggestion } from "@/components/admin/InlineFieldSuggestion.tsx";
import { useFieldContext } from "./form-context.ts";

interface TextFieldProps {
  /** Rendered as a <Label>. Omit to skip the label element entirely. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  /** AI contract field key. When set an InlineFieldSuggestion is rendered. */
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
  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={field.name}>{label}</Label>}
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
