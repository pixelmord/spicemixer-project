import { cn } from "../lib/utils";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface PromptInputSourceProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export function PromptInputSource({
  value,
  onChange,
  label = "Prompt",
  placeholder = "Describe what you want the AI to generate…",
  className,
}: PromptInputSourceProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor="prompt-input-source">{label}</Label>
      <Textarea
        id="prompt-input-source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
      />
      <p className="text-xs text-stone-400">
        The AI will use this prompt as the primary source context.
      </p>
    </div>
  );
}
