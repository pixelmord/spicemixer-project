import { useState, useRef } from "react";
import { Columns2, ArrowLeftRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import SectionNav from "./SectionNav.tsx";
import type { SectionDef } from "./SectionNav.tsx";

const RING_COLOR = { green: "#10b981", amber: "#f59e0b", red: "#ef4444" };

function MiniCompletenessRing({
  score,
  color,
}: {
  score: number;
  color: "green" | "amber" | "red";
}) {
  const r = 8;
  const c = 10;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <svg width={20} height={20} className="-rotate-90" aria-hidden="true">
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="2"
      />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={RING_COLOR[color]}
        strokeWidth="2.5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

export type { SectionDef };

export interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface EntityFormLayoutProps {
  title: React.ReactNode;
  localeChip: React.ReactNode;
  /** Shown only in non-split view (e.g. "Enhance" button). Hidden in split view. */
  headerAuxiliary?: React.ReactNode;
  overflowMenuItems?: OverflowMenuItem[];
  /** Omit (or pass empty array) to hide the section nav sidebar. */
  sections?: SectionDef[];
  completenessPanel: React.ReactNode;
  /** Score (0–100) for the mini ring shown when split view collapses the panel. */
  completenessScore?: number;
  /** Color of the mini ring. Defaults to "red". */
  completenessColor?: "green" | "amber" | "red";
  extraSidebarBlocks?: React.ReactNode;
  subHeaderStrip?: React.ReactNode;
  footer: React.ReactNode;
  splitView: boolean;
  /** The locale currently being edited (e.g. "en"). Used in swap-button label. */
  activeLocale?: string;
  /** The other locale (e.g. "de"). Drives "Add DE" / swap-button labels. */
  siblingLocale?: string;
  /** Whether a translation for siblingLocale already exists. Controls swap vs add button. */
  hasExistingTranslation?: boolean;
  /** Opens the "create translation" dialog. Shown as primary "Add [sibling]" button when no translation exists. */
  onAddTranslation?: () => void;
  onToggleSplitView: () => void;
  /** Navigates to the sibling locale. Shown as "EN ↔ DE" swap button when translation exists and split view is on. */
  onSwapLanguage?: () => void;
  children: React.ReactNode;
}

export function EntityFormLayout({
  title,
  localeChip,
  headerAuxiliary,
  overflowMenuItems = [],
  sections = [],
  completenessPanel,
  completenessScore = 0,
  completenessColor = "red",
  extraSidebarBlocks,
  subHeaderStrip,
  footer,
  splitView,
  activeLocale,
  siblingLocale,
  hasExistingTranslation = false,
  onAddTranslation,
  onToggleSplitView,
  onSwapLanguage,
  children,
}: EntityFormLayoutProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {localeChip}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Enhance — hidden in split view (translate mode replaces it) */}
          {!splitView && headerAuxiliary}

          {/* "Add [sibling]" primary button — when no translation exists yet (both views) */}
          {siblingLocale && !hasExistingTranslation && onAddTranslation && (
            <button
              type="button"
              onClick={onAddTranslation}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Add {siblingLocale.toUpperCase()}
            </button>
          )}

          {/* Language swap — split view + translation exists. Shows "EN ↔ DE", clicking navigates to sibling */}
          {splitView &&
            siblingLocale &&
            hasExistingTranslation &&
            activeLocale &&
            onSwapLanguage && (
              <button
                type="button"
                onClick={onSwapLanguage}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {activeLocale.toUpperCase()}
                <ArrowLeftRight size={12} />
                {siblingLocale.toUpperCase()}
              </button>
            )}

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
            Translate Side-by-Side
          </button>

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
        {/* Left: section nav — hidden when no sections provided */}
        {sections.length > 0 && (
          <aside className={cn("sticky top-0 h-fit shrink-0 pt-1", splitView ? "w-fit" : "w-40")}>
            <SectionNav sections={sections} containerRef={containerRef} collapsed={splitView} />
          </aside>
        )}

        {/* Center: main content */}
        <div className="min-w-0 flex-1 space-y-8 pb-24">{children}</div>

        {/* Right: completeness + extras */}
        <aside
          className={cn("sticky top-0 h-fit shrink-0 pt-1 space-y-3", splitView ? "w-fit" : "w-56")}
        >
          {splitView ? (
            <div className="relative">
              <button
                type="button"
                aria-label={`Completeness: ${completenessScore}%`}
                onClick={() => setCompletenessOpen((v) => !v)}
                className={cn(
                  "rounded-md border p-1.5 transition-colors",
                  completenessOpen
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <MiniCompletenessRing score={completenessScore} color={completenessColor} />
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
