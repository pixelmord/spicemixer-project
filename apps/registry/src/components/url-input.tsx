import { cn } from "../lib/utils";
import { Label } from "./ui/label";
import { Input } from "./ui/input";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export function UrlInput({
  value,
  onChange,
  label = "URL",
  placeholder = "https://…",
  className,
}: UrlInputProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor="url-input">{label}</Label>
      <Input
        id="url-input"
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
