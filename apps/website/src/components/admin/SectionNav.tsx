import { useState, useEffect, useRef } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export interface SectionDef {
  id: string;
  label: string;
}

interface Props {
  sections: SectionDef[];
  containerRef?: React.RefObject<HTMLElement | null>;
  collapsed?: boolean;
}

export default function SectionNav({ sections, containerRef, collapsed }: Props) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const visibleRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    visibleRef.current = new Set();

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            visibleRef.current.add(id);
          } else {
            visibleRef.current.delete(id);
          }
          // Always pick the topmost visible section in document order.
          const top = sections.find((s) => visibleRef.current.has(s.id));
          if (top) setActive(top.id);
        },
        {
          root: null,
          // Active zone: ignore top 10 % and bottom 40 % of the viewport.
          // Wide enough that big screens show all sections simultaneously and
          // still correctly highlight the topmost one.
          rootMargin: "-10% 0px -40% 0px",
          threshold: 0,
        },
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
      visibleRef.current = new Set();
    };
  }, [sections, containerRef]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (collapsed) {
    const activeLabel = sections.find((s) => s.id === active)?.label;
    return (
      <div className="relative">
        <button
          type="button"
          aria-label={activeLabel ? `Jump to section (${activeLabel})` : "Jump to section"}
          onClick={() => setPopoverOpen((v) => !v)}
          className={cn(
            "rounded-md border p-1.5 transition-colors",
            popoverOpen
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <List size={14} />
        </button>
        {popoverOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-popover shadow-md">
            {sections.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  scrollTo(id);
                  setPopoverOpen(false);
                }}
                className={cn(
                  "flex w-full items-center px-3 py-1.5 text-left text-xs font-medium transition-colors",
                  active === id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <nav className="space-y-0.5">
      {sections.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => scrollTo(id)}
          className={cn(
            "flex w-full items-center rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors",
            active === id
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
