import { resolvePublished, type PublishedCollection } from "./published-entity.ts";

export const ACTIVE_LOCALES = ["en", "de"] as const;

function localeHref(
  locale: string,
  collection: PublishedCollection,
  slug: string,
  base = "",
): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  const path = [collection, slug].join("/");
  return `${base}${prefix}/${path}/`;
}

/**
 * Returns hreflang link tags for all locales that have content for this entry,
 * plus an x-default pointing to the canonical-locale URL.
 *
 * Implemented in terms of resolvePublished so canonical-locale logic has a
 * single source of truth.
 */
export async function hreflangTags(
  slug: string,
  collection: PublishedCollection,
  base = "",
): Promise<Array<{ hrefLang: string; href: string }>> {
  const tags: Array<{ hrefLang: string; href: string }> = [];
  let canonicalLocale = "en";

  for (const locale of ACTIVE_LOCALES) {
    const resolved = await resolvePublished(collection, slug, locale);
    if (resolved && !resolved.isFallback) {
      tags.push({ hrefLang: locale, href: localeHref(locale, collection, slug, base) });
      canonicalLocale = resolved.canonicalLocale;
    }
  }

  tags.push({ hrefLang: "x-default", href: localeHref(canonicalLocale, collection, slug, base) });
  return tags;
}
