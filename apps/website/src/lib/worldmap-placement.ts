// Layer-2 worldmap placement (see ADR 0021).
//
// Given the static land-dot matrix (Layer 1) and the set of published items,
// deterministically assign each item to one empty dot inside one of its
// regions. Runs per-locale during the Astro build. Seeded so the same content
// always produces the same layout — no build-noise diffs, no flaky tests.
import type { RegionCode } from "./regions.ts";
import type { WorldmapDot } from "./worldmap-generate.ts";

export interface PlacementItem {
  slug: string;
  collection: "mixtures" | "recipes";
  region: RegionCode[];
  title: string;
  description: string;
  image: string | null;
  /** schema.org datePublished (ISO date). Missing sorts last. */
  datePublished?: string;
}

/** A dot the renderer draws: every land dot, optionally carrying an item. */
export interface ResolvedDot {
  col: number;
  row: number;
  regionId: RegionCode;
  item: PlacementItem | null;
}

/** Mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit seed (deterministic). */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Order items mixtures-first, then `datePublished` descending (missing dates
 * sort last), then slug for a stable tie-break.
 */
export function orderItems(items: PlacementItem[]): PlacementItem[] {
  return [...items].sort((a, b) => {
    if (a.collection !== b.collection) return a.collection === "mixtures" ? -1 : 1;
    const da = a.datePublished ?? "";
    const db = b.datePublished ?? "";
    if (da !== db) return db.localeCompare(da); // desc; "" (missing) sorts last
    return a.slug.localeCompare(b.slug);
  });
}

/**
 * Assign items to dots. Every land dot is returned as a {@link ResolvedDot};
 * filled dots carry their item. Each item occupies at most one dot, placed in a
 * seeded-random empty dot within one of its regions (the region is itself
 * chosen seeded-randomly among the item's regions). Items whose regions are
 * already full are dropped.
 */
export function assignItemsToDots(items: PlacementItem[], dots: WorldmapDot[]): ResolvedDot[] {
  // Index empty dots by region.
  const byRegion = new Map<RegionCode, number[]>();
  dots.forEach((dot, i) => {
    const list = byRegion.get(dot.regionId);
    if (list) list.push(i);
    else byRegion.set(dot.regionId, [i]);
  });

  const assigned = new Map<number, PlacementItem>();
  const taken = new Set<number>();

  for (const item of orderItems(items)) {
    const rng = mulberry32(hashSeed(`${item.collection}:${item.slug}`));
    // Candidate regions that still have at least one empty dot.
    const regions = item.region.filter((r) => {
      const list = byRegion.get(r);
      return list && list.some((i) => !taken.has(i));
    });
    if (regions.length === 0) continue;
    const region = regions[Math.floor(rng() * regions.length)];
    const free = byRegion.get(region)!.filter((i) => !taken.has(i));
    const choice = free[Math.floor(rng() * free.length)];
    taken.add(choice);
    assigned.set(choice, item);
  }

  return dots.map((dot, i) => ({ ...dot, item: assigned.get(i) ?? null }));
}
