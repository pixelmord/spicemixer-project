export type CollectionType = "mixture" | "ingredient" | "pairing" | "recipe";

export interface RecentEntry {
  type: CollectionType;
  slug: string;
  name: string;
  href: string;
  datePublished?: string;
}

export interface RecentlyAddedOptions {
  excludeRecipes?: boolean;
  limit?: number;
}

export function recentlyAdded(
  entries: RecentEntry[],
  options: RecentlyAddedOptions = {},
): RecentEntry[] {
  const { excludeRecipes = false, limit } = options;

  const filtered = excludeRecipes ? entries.filter((e) => e.type !== "recipe") : entries;

  const sorted = [...filtered].sort((a, b) => {
    if (a.datePublished && b.datePublished) {
      return b.datePublished.localeCompare(a.datePublished);
    }
    if (a.datePublished) return -1;
    if (b.datePublished) return 1;
    return 0;
  });

  return limit != null ? sorted.slice(0, limit) : sorted;
}
