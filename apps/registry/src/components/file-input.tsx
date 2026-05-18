import { Upload } from "lucide-react";
import { cn } from "../lib/utils";
import { Label } from "./ui/label";

interface FileInputProps {
  accept?: string;
  onChange: (file: File | null) => void;
  label?: string;
  hint?: string;
  className?: string;
}

export function FileInput({
  accept,
  onChange,
  label = "Upload file",
  hint,
  className,
}: FileInputProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor="file-input">{label}</Label>
      <label
        htmlFor="file-input"
        className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-600"
      >
        <Upload size={20} className="mb-2 text-stone-400" />
        <span>Click to select a file</span>
        {hint && <span className="mt-0.5 text-xs text-stone-400">{hint}</span>}
      </label>
      <input
        id="file-input"
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
