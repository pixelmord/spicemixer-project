/**
 * Utilities for building admin list page rows.
 *
 * `groupBySlug` is the shared primitive used by all four collection list pages
 * (ingredients, pairings, mixtures, recipes). It groups locale-prefixed items
 * (`locale/slug`) into one entry per slug, picks the best primary locale, and
 * collects the available locale codes.
 *
 * When sibling locales live at *different* filename slugs (e.g. the AI
 * translated the slug too), pass `getTranslations` to merge the groups via
 * each item's meta.translations linkage.
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
 *
 * @param getTranslations Optional resolver returning the item's meta.translations
 *   map ({ [locale]: targetSlug }). When provided, groups whose items cross-
 *   reference each other via meta are merged so a single logical entity shows
 *   as one row even when locale variants have different filename slugs.
 */
export function groupBySlug<T extends { id: string }>(
  items: T[],
  getTranslations?: (item: T) => Record<string, string> | undefined,
): SlugGroup<T>[] {
  const slugToItems = new Map<string, T[]>();

  for (const item of items) {
    const slash = item.id.indexOf("/");
    if (slash === -1) continue;
    const slug = item.id.slice(slash + 1);
    if (!slugToItems.has(slug)) slugToItems.set(slug, []);
    slugToItems.get(slug)!.push(item);
  }

  // Union-find over filename slugs, linked by meta.translations edges.
  const parent = new Map<string, string>();
  for (const slug of slugToItems.keys()) parent.set(slug, slug);
  const find = (s: string): string => {
    let r = s;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let cur = s;
    while (parent.get(cur) !== r) {
      const next = parent.get(cur)!;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  if (getTranslations) {
    for (const item of items) {
      const slash = item.id.indexOf("/");
      if (slash === -1) continue;
      const slug = item.id.slice(slash + 1);
      const translations = getTranslations(item);
      if (!translations) continue;
      for (const targetSlug of Object.values(translations)) {
        if (typeof targetSlug !== "string") continue;
        if (slugToItems.has(targetSlug)) union(slug, targetSlug);
      }
    }
  }

  const repToItems = new Map<string, T[]>();
  for (const [slug, slugItems] of slugToItems) {
    const rep = find(slug);
    if (!repToItems.has(rep)) repToItems.set(rep, []);
    repToItems.get(rep)!.push(...slugItems);
  }

  return Array.from(repToItems.entries()).map(([_rep, localeItems]) => {
    const primary = localeItems.find((i) => i.id.startsWith("en/")) ?? localeItems[0]!;
    const slash = primary.id.indexOf("/");
    const slug = primary.id.slice(slash + 1);
    const translations = localeItems
      .map((i) => i.id.slice(0, i.id.indexOf("/")))
      .filter(Boolean)
      .sort();
    return { slug, primary, translations, localeItems };
  });
}
