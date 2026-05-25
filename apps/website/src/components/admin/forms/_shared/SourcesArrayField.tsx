import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

export interface Source {
  title: string;
  url: string;
  author?: string;
  year?: string;
}

interface SourcesArrayFieldProps {
  value: Source[];
  onChange: (next: Source[]) => void;
}

function patch(value: Source[], index: number, partial: Partial<Source>): Source[] {
  return value.map((source, i) => (i === index ? { ...source, ...partial } : source));
}

export function SourcesArrayField({ value, onChange }: SourcesArrayFieldProps) {
  return (
    <div className="space-y-4">
      {value.map((src, i) => (
        <div
          key={i}
          className="rounded-md border border-border p-3 space-y-2 relative"
          data-testid={`source-row-${i}`}
        >
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-destructive"
            aria-label={`Remove source ${i + 1}`}
          >
            ✕
          </button>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input
                value={src.title}
                onChange={(e) => onChange(patch(value, i, { title: e.target.value }))}
                placeholder="Source title"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL *</Label>
              <Input
                type="url"
                value={src.url}
                onChange={(e) => onChange(patch(value, i, { url: e.target.value }))}
                placeholder="https://…"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Author</Label>
              <Input
                value={src.author ?? ""}
                onChange={(e) => onChange(patch(value, i, { author: e.target.value || undefined }))}
                placeholder="Author name"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input
                value={src.year ?? ""}
                onChange={(e) => onChange(patch(value, i, { year: e.target.value || undefined }))}
                placeholder="2024"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { title: "", url: "" }])}
        className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground w-full"
      >
        + Add source
      </button>
    </div>
  );
}
