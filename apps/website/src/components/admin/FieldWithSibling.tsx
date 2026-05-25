import { cn } from "@/lib/utils.ts";

export interface FieldWithSiblingProps {
  label: string;
  fieldKey: string;
  siblingValue?: unknown;
  siblingLocale?: string;
  splitView: boolean;
  children: React.ReactNode;
}

export function FieldWithSibling({
  label,
  fieldKey: _fieldKey,
  siblingValue,
  siblingLocale,
  splitView,
  children,
}: FieldWithSiblingProps) {
  if (!splitView) {
    return <div className="space-y-1.5">{children}</div>;
  }

  const siblingDisplay = Array.isArray(siblingValue)
    ? (siblingValue as unknown[])
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join(", ")
    : typeof siblingValue === "string"
      ? siblingValue
      : siblingValue != null
        ? JSON.stringify(siblingValue)
        : "";

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">{children}</div>
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">
          {label}
          {siblingLocale ? ` (${siblingLocale.toUpperCase()})` : ""}
        </span>
        <div
          className={cn(
            "min-h-8 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-1.5 text-sm text-muted-foreground",
            !siblingDisplay && "italic",
          )}
        >
          {siblingDisplay || <span className="text-xs opacity-60">—</span>}
        </div>
      </div>
    </div>
  );
}
