import { cn } from "../lib/utils";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface TextAreaSourceProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export function TextAreaSource({
  value,
  onChange,
  label = "Paste text",
  placeholder = "Paste source text here…",
  className,
}: TextAreaSourceProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor="text-area-source">{label}</Label>
      <Textarea
        id="text-area-source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
      />
    </div>
  );
}
