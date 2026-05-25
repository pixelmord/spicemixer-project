import { cn } from "../lib/utils";

interface SuggestionLayoutProps {
  /**
   * Read-only sibling-locale source value rendered alongside the suggestion
   * in translation review flows. When provided, switches to a three-column
   * grid; otherwise the suggestion renders full-width.
   */
  sourceSlot?: React.ReactNode;
  /** Optional retranslate affordance rendered below the suggestion row. */
  retranslateSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SuggestionLayout({
  sourceSlot,
  retranslateSlot,
  children,
  className,
}: SuggestionLayoutProps) {
  if (sourceSlot) {
    return (
      <div className={cn("mt-1.5 grid grid-cols-[1fr_1fr_2fr] gap-2", className)}>
        <div className="rounded-md border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground">
          {sourceSlot}
        </div>
        <div className="text-xs text-muted-foreground" />
        <div>
          {children}
          {retranslateSlot}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-1.5", className)}>
      {children}
      {retranslateSlot}
    </div>
  );
}
