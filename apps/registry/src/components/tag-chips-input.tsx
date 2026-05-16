import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagChipsInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export function TagChipsInput({
  tags,
  onChange,
  label = "Tags",
  placeholder = "Type and press Enter…",
  className,
}: TagChipsInputProps) {
  const [input, setInput] = useState("");

  function addTag(value: string) {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor="tag-chips-input">{label}</Label>
      <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border px-3 py-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              className="rounded-full hover:bg-stone-200"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <Input
          id="tag-chips-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input) addTag(input);
          }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="h-auto min-w-[120px] flex-1 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
        />
      </div>
      <p className="text-xs text-stone-400">Press Enter or comma to add a tag.</p>
    </div>
  );
}
