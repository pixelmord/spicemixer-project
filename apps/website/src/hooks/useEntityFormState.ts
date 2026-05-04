import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { actions } from "astro:actions";
import type { EntityKind } from "entity-kind";
import type { CompletenessResult } from "@/lib/completeness.ts";

export interface UseEntityFormStateOpts {
  kind: EntityKind;
  collection: string;
  isNew: boolean;
  initialSlug?: string;
  initialLocale?: string;
  initialDraft?: boolean;
  initialCompleteness: CompletenessResult;
}

export interface UseEntityFormStateReturn {
  slug: string;
  setSlug: Dispatch<SetStateAction<string>>;
  slugChecking: boolean;
  slugAvailable: boolean | null;

  draft: boolean;
  setDraft: Dispatch<SetStateAction<boolean>>;

  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;

  locale: string;
  setLocale: Dispatch<SetStateAction<string>>;
  localeReady: boolean;

  completeness: CompletenessResult;
  setCompleteness: Dispatch<SetStateAction<CompletenessResult>>;
}

export function useEntityFormState(opts: UseEntityFormStateOpts): UseEntityFormStateReturn {
  const {
    kind,
    collection,
    isNew,
    initialSlug = "",
    initialLocale = "",
    initialDraft = isNew,
    initialCompleteness,
  } = opts;

  const [slug, setSlug] = useState(initialSlug);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);

  const [locale, setLocale] = useState(initialLocale);
  const [completeness, setCompleteness] = useState(initialCompleteness);

  // Pairings carry inline locale-keyed descriptions — no per-entity locale
  // is needed (ADR 0003).
  const localeReady = kind === "pairing" || locale !== "";

  useEffect(() => {
    if (!isNew || !slug || kind === "pairing") {
      setSlugAvailable(null);
      return;
    }
    setSlugChecking(true);
    const slugPath = collection === "ingredients" ? `${locale}/${slug}` : slug;
    const t = setTimeout(() => {
      void actions
        .checkSlugAvailable({
          collection: collection as "recipes" | "mixtures" | "ingredients",
          slug: slugPath,
        })
        .then((r: { data?: unknown }) => {
          const data = r.data as { available: boolean } | undefined;
          if (data) setSlugAvailable(data.available);
        })
        .finally(() => setSlugChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [slug, isNew, collection, locale, kind]);

  return {
    slug,
    setSlug,
    slugChecking,
    slugAvailable,
    draft,
    setDraft,
    saving,
    setSaving,
    locale,
    setLocale,
    localeReady,
    completeness,
    setCompleteness,
  };
}
