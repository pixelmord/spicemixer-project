import { useState, useRef } from "react";
import { Columns2, ArrowLeftRight, MoreHorizontal, Gauge } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import SectionNav from "./SectionNav.tsx";
import type { SectionDef } from "./SectionNav.tsx";

export type { SectionDef };

export interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface EntityFormLayoutProps {
  title: React.ReactNode;
  localeChip: React.ReactNode;
  headerAuxiliary?: React.ReactNode;
  overflowMenuItems?: OverflowMenuItem[];
  sections: SectionDef[];
  completenessPanel: React.ReactNode;
  extraSidebarBlocks?: React.ReactNode;
  subHeaderStrip?: React.ReactNode;
  footer: React.ReactNode;
  splitView: boolean;
  siblingLocale?: string;
  onToggleSplitView: () => void;
  onSwapLanguage?: () => void;
  children: React.ReactNode;
}

export function EntityFormLayout({
  title,
  localeChip,
  headerAuxiliary,
  overflowMenuItems = [],
  sections,
  completenessPanel,
  extraSidebarBlocks,
  subHeaderStrip,
  footer,
  splitView,
  siblingLocale,
  onToggleSplitView,
  onSwapLanguage,
  children,
}: EntityFormLayoutProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {localeChip}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {headerAuxiliary}

          {/* Split-view toggle */}
          <button
            type="button"
            aria-label="Toggle split view"
            onClick={onToggleSplitView}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              splitView
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Columns2 size={13} />
            Split view
          </button>

          {/* Sibling locale + swap */}
          {splitView && siblingLocale && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              {siblingLocale.toUpperCase()}
              {onSwapLanguage && (
                <button
                  type="button"
                  aria-label="Swap language"
                  onClick={onSwapLanguage}
                  className="ml-0.5 rounded p-0.5 hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeftRight size={12} />
                </button>
              )}
            </span>
          )}

          {/* Overflow menu */}
          {overflowMenuItems.length > 0 && (
            <div className="relative">
              <button
                type="button"
                aria-label="More options"
                onClick={() => setOverflowOpen((v) => !v)}
                className="inline-flex items-center rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <MoreHorizontal size={15} />
              </button>
              {overflowOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-popover shadow-md">
                  {overflowMenuItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setOverflowOpen(false);
                        item.onClick();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {subHeaderStrip && <div className="mb-4">{subHeaderStrip}</div>}

      {/* Body */}
      <div ref={containerRef} className="flex gap-6">
        {/* Left: section nav */}
        <aside className="sticky top-0 h-fit w-40 shrink-0 pt-1">
          <SectionNav sections={sections} containerRef={containerRef} />
        </aside>

        {/* Center: main content */}
        <div className="min-w-0 flex-1 space-y-8 pb-24">{children}</div>

        {/* Right: completeness + extras */}
        <aside className="sticky top-0 h-fit w-56 shrink-0 pt-1 space-y-3">
          {splitView ? (
            <div className="relative">
              <button
                type="button"
                aria-label="Toggle completeness panel"
                onClick={() => setCompletenessOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Gauge size={13} />
                Completeness
              </button>
              {completenessOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-64">{completenessPanel}</div>
              )}
            </div>
          ) : (
            completenessPanel
          )}
          {extraSidebarBlocks}
        </aside>
      </div>

      {footer}
    </div>
  );
}
