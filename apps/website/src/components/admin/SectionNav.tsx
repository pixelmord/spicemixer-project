import { useState, useEffect } from "react";
import { cn } from "@/lib/utils.ts";

export interface SectionDef {
  id: string;
  label: string;
}

interface Props {
  sections: SectionDef[];
  containerRef?: React.RefObject<HTMLElement | null>;
}

export default function SectionNav({ sections, containerRef }: Props) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) setActive(id);
        },
        {
          root: containerRef?.current ?? null,
          rootMargin: "-20% 0px -70% 0px",
          threshold: 0,
        },
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [sections, containerRef]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
