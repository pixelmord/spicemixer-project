/**
 * Utilities for building admin list page rows.
 *
 * `groupBySlug` is the shared primitive used by all four collection list pages
 * (ingredients, pairings, mixtures, recipes). It groups locale-prefixed items
 * (`locale/slug`) into one entry per slug, picks the best primary locale, and
 * collects the available locale codes.
 */

export interface SlugGroup<T extends { id: string }> {
  /** The slug portion of the id (everything after the first `/`). */
  slug: string;
  /** Best primary item: prefers `en/…`, falls back to the first in the group. */
  primary: T;
  /** Sorted list of available locale codes (e.g. `["de", "en"]`). */
  translations: string[];
  /** All locale variants for this slug. */
  localeItems: T[];
}

/**
 * Group an array of locale-prefixed content items into one entry per slug.
 *
 * Items whose `id` does not contain a `/` (no locale prefix) are silently
 * skipped so stale root-level files don't appear in the list.
 */
export function groupBySlug<T extends { id: string }>(items: T[]): SlugGroup<T>[] {
  const slugMap = new Map<string, T[]>();

  for (const item of items) {
    const slash = item.id.indexOf("/");
    if (slash === -1) continue; // no locale prefix — skip
    const slug = item.id.slice(slash + 1);
    if (!slugMap.has(slug)) slugMap.set(slug, []);
    slugMap.get(slug)!.push(item);
  }

  return Array.from(slugMap.entries()).map(([slug, localeItems]) => {
    const primary = localeItems.find((i) => i.id.startsWith("en/")) ?? localeItems[0]!;
    const translations = localeItems
      .map((i) => i.id.slice(0, i.id.indexOf("/")))
      .filter(Boolean)
      .sort();
    return { slug, primary, translations, localeItems };
  });
}
