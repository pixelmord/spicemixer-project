import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { actions } from "astro:actions";
import type { EntityKind } from "entity-kind";
import type { CompletenessResult } from "@/lib/completeness.ts";

export interface UseEntityFormStateOpts {
  kind: EntityKind;
  /** Astro collection name (e.g. "ingredients", "recipes", "mixtures", "pairings"). */
  collection: string;
  isNew: boolean;
  initialSlug?: string;
  /** Initial locale: the locale prop on IngredientForm, or meta.language on RecipeForm. */
  initialLocale?: string;
  initialDraft?: boolean;
  initialCompleteness: CompletenessResult;
}

export interface UseEntityFormStateReturn {
  // ── Slug ──────────────────────────────────────────────────────────────────
  slug: string;
  setSlug: Dispatch<SetStateAction<string>>;
  slugChecking: boolean;
  slugAvailable: boolean | null;

  // ── Draft ─────────────────────────────────────────────────────────────────
  draft: boolean;
  setDraft: Dispatch<SetStateAction<boolean>>;

  // ── Save progress ─────────────────────────────────────────────────────────
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;

  // ── Locale ────────────────────────────────────────────────────────────────
  locale: string;
  setLocale: Dispatch<SetStateAction<string>>;
  /** True when locale is determined (any value) or when kind === "pairing". */
  localeReady: boolean;

  // ── Completeness ──────────────────────────────────────────────────────────
  completeness: CompletenessResult;
  setCompleteness: Dispatch<SetStateAction<CompletenessResult>>;
}

/**
 * Shared form state for RecipeForm, IngredientForm, and PairingForm.
 *
 * Covers: slug availability check, draft toggle, locale-required guard (ADR
 * 0009), completeness scoring, and save progress. Kind-specific field arrays
 * and the submit payload remain in each form component.
 */
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

  // Pairings carry inline locale-keyed descriptions (ADR 0003 exception) —
  // no per-entity locale is needed, so localeReady is always true.
  const localeReady = kind === "pairing" ? true : locale !== "";

  // Debounced slug availability check — new entries only, skipped for pairings
  // (pairing id is derived from the two ingredient slugs at save time).
  useEffect(() => {
    if (!isNew || !slug || kind === "pairing") {
      setSlugAvailable(null);
      return;
    }
    setSlugChecking(true);
    const slugPath = collection === "ingredients" ? `${locale}/${slug}` : slug;
    const t = setTimeout(() => {
      void actions
        .checkSlugAvailable({ collection, slug: slugPath })
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
