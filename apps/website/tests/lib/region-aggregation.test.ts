import { describe, expect, test } from "vite-plus/test";
import { regionAggregation } from "../../src/lib/region-aggregation.ts";
import { REGIONS } from "../../src/lib/regions.ts";
import type { AggregationEntry } from "../../src/lib/region-aggregation.ts";

describe("regionAggregation", () => {
  test("returns an all-zero map for an empty corpus", () => {
    const result = regionAggregation([]);
    expect(result.size).toBe(REGIONS.length);
    for (const [, counts] of result) {
      expect(counts).toEqual({ mixtures: 0, ingredients: 0, recipes: 0 });
    }
  });

  test("result map has an entry for every region code", () => {
    const result = regionAggregation([]);
    for (const code of REGIONS) {
      expect(result.has(code)).toBe(true);
    }
  });

  test("increments ingredient counter for the correct region", () => {
    const entries: AggregationEntry[] = [{ type: "ingredient", region: ["levant"] }];
    const result = regionAggregation(entries);
    expect(result.get("levant")).toEqual({ mixtures: 0, ingredients: 1, recipes: 0 });
  });

  test("increments mixture counter for the correct region", () => {
    const entries: AggregationEntry[] = [{ type: "mixture", region: ["levant"] }];
    const result = regionAggregation(entries);
    expect(result.get("levant")).toEqual({ mixtures: 1, ingredients: 0, recipes: 0 });
  });

  test("increments recipe counter for the correct region", () => {
    const entries: AggregationEntry[] = [{ type: "recipe", region: ["levant"] }];
    const result = regionAggregation(entries);
    expect(result.get("levant")).toEqual({ mixtures: 0, ingredients: 0, recipes: 1 });
  });

  test("increments counters across multiple regions for a single entry", () => {
    const entries: AggregationEntry[] = [
      { type: "ingredient", region: ["levant", "mediterranean"] },
    ];
    const result = regionAggregation(entries);
    expect(result.get("levant")).toEqual({ mixtures: 0, ingredients: 1, recipes: 0 });
    expect(result.get("mediterranean")).toEqual({ mixtures: 0, ingredients: 1, recipes: 0 });
  });

  test("increments the right per-type counters when entries span multiple regions and types", () => {
    const entries: AggregationEntry[] = [
      { type: "ingredient", region: ["levant", "mediterranean"] },
      { type: "mixture", region: ["levant"] },
      { type: "recipe", region: ["mediterranean"] },
    ];
    const result = regionAggregation(entries);
    expect(result.get("levant")).toEqual({ mixtures: 1, ingredients: 1, recipes: 0 });
    expect(result.get("mediterranean")).toEqual({ mixtures: 0, ingredients: 1, recipes: 1 });
    expect(result.get("east-asia")).toEqual({ mixtures: 0, ingredients: 0, recipes: 0 });
  });

  test.each([
    {
      label: "draft ingredient excluded",
      entry: { type: "ingredient", region: ["levant"], draft: true },
    },
    {
      label: "draft mixture excluded",
      entry: { type: "mixture", region: ["levant"], draft: true },
    },
    { label: "draft recipe excluded", entry: { type: "recipe", region: ["levant"], draft: true } },
  ])("$label", ({ entry }) => {
    const result = regionAggregation([entry as AggregationEntry]);
    expect(result.get("levant")).toEqual({ mixtures: 0, ingredients: 0, recipes: 0 });
  });

  test("draft:false entry is included", () => {
    const entries: AggregationEntry[] = [
      { type: "ingredient", region: ["east-asia"], draft: false },
    ];
    const result = regionAggregation(entries);
    expect(result.get("east-asia")).toEqual({ mixtures: 0, ingredients: 1, recipes: 0 });
  });

  test("entry without draft field is included", () => {
    const entries: AggregationEntry[] = [{ type: "ingredient", region: ["east-asia"] }];
    const result = regionAggregation(entries);
    expect(result.get("east-asia")).toEqual({ mixtures: 0, ingredients: 1, recipes: 0 });
  });

  test("published entries and draft entries are counted independently", () => {
    const entries: AggregationEntry[] = [
      { type: "ingredient", region: ["levant"] },
      { type: "ingredient", region: ["levant"], draft: true },
      { type: "mixture", region: ["levant"] },
    ];
    const result = regionAggregation(entries);
    expect(result.get("levant")).toEqual({ mixtures: 1, ingredients: 1, recipes: 0 });
  });

  test("unknown region codes are ignored gracefully", () => {
    const entries: AggregationEntry[] = [
      { type: "ingredient", region: ["not-a-real-region" as never, "levant"] },
    ];
    const result = regionAggregation(entries);
    expect(result.get("levant")).toEqual({ mixtures: 0, ingredients: 1, recipes: 0 });
    expect(result.has("not-a-real-region" as never)).toBe(false);
  });
});
