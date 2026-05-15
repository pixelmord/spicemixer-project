import { REGIONS, type RegionCode } from "./regions.ts";

export type AggregationEntry = {
  type: "mixture" | "ingredient" | "recipe";
  region: string[];
  draft?: boolean;
};

export type RegionCount = { mixtures: number; ingredients: number; recipes: number };

/** Entries without a draft field are treated as published. */
export function regionAggregation(entries: AggregationEntry[]): Map<RegionCode, RegionCount> {
  const result = new Map<RegionCode, RegionCount>();
  for (const code of REGIONS) {
    result.set(code, { mixtures: 0, ingredients: 0, recipes: 0 });
  }

  const regionSet = new Set<string>(REGIONS);

  for (const entry of entries) {
    if (entry.draft === true) continue;
    for (const code of entry.region) {
      if (!regionSet.has(code)) continue;
      const counts = result.get(code as RegionCode)!;
      if (entry.type === "mixture") counts.mixtures++;
      else if (entry.type === "ingredient") counts.ingredients++;
      else if (entry.type === "recipe") counts.recipes++;
    }
  }

  return result;
}
