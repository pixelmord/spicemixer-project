import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export interface EntityOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: EntityOption[];
  placeholder?: string;
  onCreateNew?: (name: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export default function EntityCombobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  onCreateNew,
  className,
  id,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

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

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        onClick={disabled ? undefined : handleOpen}
        disabled={disabled}
        className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={cn(!selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" />
      </button>

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
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <Check
                  size={14}
                  className={cn("shrink-0", value === o.value ? "opacity-100" : "opacity-0")}
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
