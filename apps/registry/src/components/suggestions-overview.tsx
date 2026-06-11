import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import type { FieldSummary } from "./use-ai-suggestions";

/** One candidate field the consumer wants represented in the overview. */
export interface OverviewField {
  field: string;
  /** Human label shown in the list. */
  label: string;
  /** Element id to scroll to when the entry is clicked (e.g. a section id). */
  anchor?: string;
}

interface SuggestionsOverviewProps {
  /**
   * The refineable fields to account for, in display order. Fields present
   * here but absent from the run are shown under "Not suggested", so the user
   * always sees the complete picture — with and without suggestions.
   */
  fields: OverviewField[];
  className?: string;
}

function scrollToAnchor(anchor: string | undefined) {
  if (!anchor || typeof document === "undefined") return;
  const el = document.getElementById(anchor);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Dropdown on the bulk-suggest button that lists, for every refineable field,
 * whether the last run produced new suggestions — and links each entry to its
 * field. This is the single place an editor learns "what did the AI change",
 * including the case where everything the model returned duplicates existing
 * values (then we say so rather than showing an empty, silent button).
 */
export function SuggestionsOverview({ fields, className }: SuggestionsOverviewProps) {
  const flow = useSuggestionFlowContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (flow.isRunning) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium opacity-60",
          className,
        )}
      >
        <Loader2 size={14} className="animate-spin" />
        Running…
      </button>
    );
  }

  const byField = new Map<string, FieldSummary>(flow.fieldSummaries.map((s) => [s.field, s]));
  // A run has produced output once we have any summaries; before that, this is
  // just the entry point to kick off a run.
  const hasRun = flow.fieldSummaries.length > 0;

  if (!hasRun) {
    return (
      <button
        type="button"
        onClick={() => void flow.run()}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors",
          className,
        )}
      >
        <Sparkles size={14} />
        Get AI suggestions
      </button>
    );
  }

  const withNew = fields.filter((f) => byField.get(f.field)?.hasNew);
  const allDuplicate = fields.filter((f) => {
    const s = byField.get(f.field);
    return s && !s.hasNew;
  });
  const notSuggested = fields.filter((f) => !byField.has(f.field));
  const newCount = withNew.length;

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="suggestions-overview-trigger"
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity",
          newCount > 0
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border text-foreground hover:bg-muted",
        )}
      >
        <Sparkles size={14} />
        {newCount > 0 ? `Suggestions (${newCount})` : "Suggestions"}
        <ChevronDown size={14} className="opacity-70" />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="suggestions-overview-panel"
          className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-md"
        >
          {newCount === 0 && (
            <p
              data-testid="suggestions-overview-empty"
              className="px-2 py-2 text-xs text-muted-foreground"
            >
              No significant new suggestions — the AI only returned values this entry already has.
            </p>
          )}

          {withNew.length > 0 && (
            <Group label="New suggestions">
              {withNew.map((f) => {
                const s = byField.get(f.field)!;
                return (
                  <Row
                    key={f.field}
                    label={f.label}
                    count={s.newCount}
                    onClick={() => {
                      scrollToAnchor(f.anchor);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </Group>
          )}

          {allDuplicate.length > 0 && (
            <Group label="Nothing new">
              {allDuplicate.map((f) => (
                <Row
                  key={f.field}
                  label={f.label}
                  muted
                  hint="all already present"
                  onClick={() => {
                    scrollToAnchor(f.anchor);
                    setOpen(false);
                  }}
                />
              ))}
            </Group>
          )}

          {notSuggested.length > 0 && (
            <Group label="Not suggested">
              {notSuggested.map((f) => (
                <Row
                  key={f.field}
                  label={f.label}
                  muted
                  onClick={() => {
                    scrollToAnchor(f.anchor);
                    setOpen(false);
                  }}
                />
              ))}
            </Group>
          )}

          <div className="mt-1 flex items-center justify-between border-t border-border px-2 pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void flow.run();
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Re-run
            </button>
            {flow.suggestions.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  flow.acceptAll();
                  setOpen(false);
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Accept all ({flow.suggestions.size})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-0.5">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  label,
  count,
  hint,
  muted,
  onClick,
}: {
  label: string;
  count?: number;
  hint?: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
        muted && "text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {typeof count === "number" && (
        <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
          {count}
        </span>
      )}
      {hint && <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}
