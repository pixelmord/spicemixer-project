import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

interface SlugFieldProps {
  slug: string;
  onChange: (next: string) => void;
  name: string;
  available?: boolean | null;
  checking?: boolean;
  onAiSuggest: (name: string) => Promise<string | null>;
  onAiSuggestError?: (err: unknown) => void;
  placeholder?: string;
}

function statusLabel(checking: boolean, available: boolean | null | undefined): string {
  if (checking) return "…";
  if (available === true) return "✓ available";
  if (available === false) return "✗ taken";
  return "";
}

function statusColor(checking: boolean, available: boolean | null | undefined): string {
  if (checking) return "text-muted-foreground";
  if (available === true) return "text-emerald-600";
  if (available === false) return "text-red-500";
  return "";
}

export function SlugField({
  slug,
  onChange,
  name,
  available = null,
  checking = false,
  onAiSuggest,
  onAiSuggestError,
  placeholder = "cardamom",
}: SlugFieldProps) {
  async function handleAiSuggest() {
    if (!name) return;
    try {
      const next = await onAiSuggest(name);
      if (next) onChange(next);
    } catch (err) {
      onAiSuggestError?.(err);
    }
  }

  const status = statusLabel(checking, available);

  return (
    <div className="space-y-1.5">
      <Label>Slug</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={slug}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label="Slug"
          />
          {slug && status && (
            <span
              data-testid="slug-status"
              className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium ${statusColor(checking, available)}`}
            >
              {status}
            </span>
          )}
        </div>
        <button
          type="button"
          title="AI suggest slug"
          aria-label="AI suggest slug"
          onClick={handleAiSuggest}
          disabled={!name}
          className="flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={12} />
        </button>
      </div>
    </div>
  );
}
