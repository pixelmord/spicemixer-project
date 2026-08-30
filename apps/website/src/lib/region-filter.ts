// Shared region-filter helper for the recipes & mixtures index pages.
// Derives the FilterBar group (only regions actually present in the content)
// and the `data-filter-region` attribute value for a card. See ADR 0021.
import { REGIONS, REGION_LABELS, type RegionCode } from "./regions.ts";

type Lang = "en" | "de";

/** `data-filter-region` value for a card: its regions, comma-joined. */
export function regionFilterAttr(region: readonly string[] | undefined): string {
  return (region ?? []).filter(Boolean).join(",");
}

/**
 * Build the `{ value, label }[]` for the region filter group from the regions
 * present across `items`. Sorted by canonical REGIONS order; localized label.
 */
export function regionFilterValues(
  items: Array<{ region?: readonly string[] }>,
  lang: Lang,
): Array<{ value: string; label: string }> {
  const present = new Set<string>();
  for (const item of items) {
    for (const code of item.region ?? []) present.add(code);
  }
  return REGIONS.filter((code) => present.has(code)).map((code: RegionCode) => ({
    value: code,
    label: REGION_LABELS[code][lang],
  }));
}
