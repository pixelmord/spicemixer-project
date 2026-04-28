import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export interface EntityOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string[];
  onChange: (values: string[]) => void;
  options: EntityOption[];
  placeholder?: string;
  onCreateNew?: (name: string) => void;
  className?: string;
}

export default function EntityMultiCombobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  onCreateNew,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.filter((o) => value.includes(o.value));

  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(query.toLowerCase()) ||
      o.value.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function toggle(val: string) {
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  }

  function remove(val: string) {
    onChange(value.filter((v) => v !== val));
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className="flex min-h-8 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {selected.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
          >
            {o.label}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(o.value);
              }}
              className="rounded-sm opacity-70 hover:opacity-100"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <span className="flex flex-1 items-center justify-between">
          {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown size={14} className="ml-auto shrink-0 text-muted-foreground" />
        </span>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-48 rounded-lg border border-border bg-popover shadow-md">
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && !onCreateNew && (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">No results</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => toggle(o.value)}
              >
                <Check
                  size={14}
                  className={cn("shrink-0", value.includes(o.value) ? "opacity-100" : "opacity-0")}
                />
                <span className="flex-1">{o.label}</span>
                {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
              </button>
            ))}
            {onCreateNew && (
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-border px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setOpen(false);
                  onCreateNew(query);
                }}
              >
                <Plus size={14} className="shrink-0" />
                {query ? `Create "${query}"` : "Create new…"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
