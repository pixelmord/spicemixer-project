import { useEffect, useState } from "react";
import type { SiblingLocale } from "@registry/components/use-ai-suggestions";
import { getSiblingEntity } from "@/lib/get-sibling-entity";

type EntityKind = "recipe" | "mixture" | "ingredient" | "pairing";

export interface UseSiblingEntityParams {
  kind: EntityKind;
  slug: string;
  locale: string;
  enabled: boolean;
  currentLocale?: string;
}

export function useSiblingEntity(params: UseSiblingEntityParams): SiblingLocale | null {
  const { kind, slug, locale, enabled, currentLocale } = params;
  const [data, setData] = useState<SiblingLocale | null>(null);

  useEffect(() => {
    if (!enabled || !slug) {
      setData(null);
      return;
    }
    let cancelled = false;
    void getSiblingEntity({ kind, slug, locale, currentLocale }).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, slug, locale, enabled, currentLocale]);

  return data;
}
