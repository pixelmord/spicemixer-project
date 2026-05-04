import type { EntityKind } from "entity-kind";
import { validateSlug } from "./slug-validator.ts";

export type BuildPayloadError =
  | "missing-slug"
  | "slug-taken"
  | "slug-reserved"
  | "missing-locale"
  | "missing-kind";

export interface SlugWarning {
  type: "cross-collection-collision";
  otherCollection: string;
  slug: string;
}

export interface BuildPayloadFailure {
  ok: false;
  errors: BuildPayloadError[];
}

export interface BuildPayloadSuccess {
  ok: true;
  slug: string;
  locale: string;
  draft: boolean;
  warnings: SlugWarning[];
  errors?: never;
}

export type BuildPayloadResult = BuildPayloadFailure | BuildPayloadSuccess;

export interface BuildPayloadOptions {
  kind?: EntityKind;
  collection: string;
  slug: string;
  isNew: boolean;
  /** null = not yet checked; true = available; false = taken. */
  slugAvailable?: boolean | null;
  /** Empty string means locale not yet set. */
  locale: string;
  draft: boolean;
  mixtureKind?: string;
  existingSlugs?: Partial<Record<string, string[]>>;
}

export function buildPayload(opts: BuildPayloadOptions): BuildPayloadResult {
  const {
    kind,
    collection,
    slug,
    isNew,
    slugAvailable = null,
    locale,
    draft,
    mixtureKind,
    existingSlugs = {},
  } = opts;

  const errors: BuildPayloadError[] = [];
  const warnings: SlugWarning[] = [];

  if (!slug) {
    errors.push("missing-slug");
  } else {
    if (isNew && slugAvailable === false) {
      errors.push("slug-taken");
    }

    const validation = validateSlug(
      slug,
      collection as Parameters<typeof validateSlug>[1],
      existingSlugs as Parameters<typeof validateSlug>[2],
    );

    if (!validation.ok && validation.reason === "reserved") {
      errors.push("slug-reserved");
    } else if (validation.ok && validation.warning) {
      warnings.push({
        type: "cross-collection-collision",
        otherCollection: validation.warning.otherCollection,
        slug,
      });
    }
  }

  // Pairings are exempt — inline locale-keyed descriptions (ADR 0003).
  const localeRequired = kind !== "pairing" && collection !== "pairings";
  if (localeRequired && !locale) {
    errors.push("missing-locale");
  }

  if (collection === "mixtures" && !mixtureKind) {
    errors.push("missing-kind");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, slug, locale, draft, warnings };
}
