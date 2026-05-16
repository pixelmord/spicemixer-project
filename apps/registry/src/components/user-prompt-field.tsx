import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface UserPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function UserPromptField({
  value,
  onChange,
  placeholder = "Add instructions for the AI…",
  label = "Custom instructions",
  className,
}: UserPromptFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor="user-prompt">{label}</Label>
      <Textarea
        id="user-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  );
}
