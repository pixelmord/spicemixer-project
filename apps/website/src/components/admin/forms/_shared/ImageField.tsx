import type { ReactNode } from "react";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useImageHealth } from "@/hooks/use-image-health";
import type { ImageAttribution } from "@/components/admin/ImageSearchModal.tsx";

interface ImageFieldProps {
  value: string;
  onChange: (next: string) => void;
  attribution?: ImageAttribution;
  onClearAttribution?: () => void;
  onOpenSearch?: () => void;
  hint?: ReactNode;
  label?: string;
  id?: string;
}

export function ImageField({
  value,
  onChange,
  attribution,
  onClearAttribution,
  onOpenSearch,
  hint,
  label = "Image URL",
  id = "image-url",
}: ImageFieldProps) {
  const { broken } = useImageHealth(value);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>
          {label}
          {hint}
        </Label>
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="text-xs text-primary hover:underline"
          >
            Search image…
          </button>
        )}
      </div>
      <Input
        type="url"
        id={id}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          if (!next) onClearAttribution?.();
        }}
        placeholder="https://…"
        className={broken ? "border-amber-400" : ""}
      />
      {broken && (
        <p
          className="text-xs text-amber-600 dark:text-amber-400"
          data-testid="image-broken-warning"
        >
          ⚠ Image URL appears broken or unreachable
        </p>
      )}
      {attribution && (
        <p className="text-[11px] text-muted-foreground" data-testid="image-attribution">
          {attribution.attribution}
        </p>
      )}
    </div>
  );
}
