import { useState, useEffect } from "react";
import { actions } from "astro:actions";
import { Languages, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

interface Props {
  slug: string;
  currentLocale: "en" | "de";
  children: (companion: CompanionContext) => React.ReactNode;
}

export interface CompanionContext {
  /** If true, the side-by-side translation view is active */
  showTranslation: boolean;
  /** The other locale's data, keyed by field name */
  otherData: Record<string, unknown>;
  /** The other locale code */
  otherLocale: "en" | "de";
}

interface FieldCompanionProps {
  label: string;
  fieldKey: string;
  context: CompanionContext;
  children: React.ReactNode;
}

export function FieldWithTranslation({ label, fieldKey, context, children }: FieldCompanionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const otherValue = context.otherData[fieldKey];
  const otherDisplay = Array.isArray(otherValue)
    ? otherValue.join(", ")
    : typeof otherValue === "string"
      ? otherValue
      : "";

  if (!context.showTranslation) {
    return <div className="space-y-1.5">{children}</div>;
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">{children}</div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {label} ({context.otherLocale.toUpperCase()})
            </span>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          {!collapsed && (
            <div
              className={cn(
                "min-h-8 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-1.5 text-sm text-muted-foreground",
                !otherValue && "italic",
              )}
            >
              {otherValue != null && otherValue !== "" ? (
                otherDisplay
              ) : (
                <a
                  href={`/admin/ingredients/${fieldKey}/edit?locale=${context.otherLocale}`}
                  className="text-xs text-primary hover:underline"
                >
                  Add {context.otherLocale.toUpperCase()} translation →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TranslationCompanion({ slug, currentLocale, children }: Props) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [otherData, setOtherData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const otherLocale: "en" | "de" = currentLocale === "en" ? "de" : "en";

  useEffect(() => {
    if (!showTranslation || !slug) return;
    setLoading(true);
    void actions
      .getItem({ collection: "ingredients", id: `${otherLocale}/${slug}` })
      .then(({ data }: { data?: { item?: { data: unknown } | null } | null }) => {
        setOtherData((data?.item?.data as Record<string, unknown>) ?? {});
      })
      .finally(() => setLoading(false));
  }, [showTranslation, slug, otherLocale]);

  const context: CompanionContext = { showTranslation, otherData, otherLocale };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button
          type="button"
          variant={showTranslation ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowTranslation((v) => !v)}
        >
          <Languages size={14} className="mr-1.5" />
          {showTranslation ? "Hide" : "Show"} {otherLocale.toUpperCase()} translation
          {loading && <span className="ml-1 text-xs opacity-60">…</span>}
        </Button>
        {showTranslation && (
          <a
            href={`/admin/ingredients/${slug}/edit?locale=${otherLocale}`}
            target="_blank"
            className="text-xs text-primary hover:underline"
          >
            Edit {otherLocale.toUpperCase()} →
          </a>
        )}
      </div>
      {children(context)}
    </div>
  );
}
