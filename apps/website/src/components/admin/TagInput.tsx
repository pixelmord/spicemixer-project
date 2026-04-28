import { useState, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils.ts";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  id?: string;
}

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add tag…",
  className,
  id,
}: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions
    .filter((s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase().trim()))
    .slice(0, 8);

  function commit(raw: string) {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setInput("");
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      commit(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      remove(value.length - 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (text.includes(",")) {
      e.preventDefault();
      const tags = text
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t && !value.includes(t));
      if (tags.length) onChange([...value, ...tags]);
    }
  }

  return (
    <div
      className={cn(
        "relative flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 cursor-text",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(i);
            }}
            className="rounded-sm opacity-70 hover:opacity-100"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <div className="relative min-w-20 flex-1">
        <input
          ref={inputRef}
          id={id}
          value={input}
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
            if (input.trim()) commit(input);
          }}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {open && filtered.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-40 rounded-lg border border-border bg-popover py-1 shadow-md">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                className="w-full px-2.5 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={() => commit(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
