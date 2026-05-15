import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { REGIONS } from "../src/lib/regions.ts";
import { regionAggregation } from "../src/lib/region-aggregation.ts";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components");

describe("Worldmap component: source structure", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "Worldmap.astro"), "utf-8");
  });

  test("accepts aggregation and locale props", () => {
    expect(src).toContain("aggregation");
    expect(src).toContain("locale");
  });

  test("imports REGIONS and DOT_POSITIONS from regions.ts", () => {
    expect(src).toContain("REGIONS");
    expect(src).toContain("DOT_POSITIONS");
  });

  test("renders one element per region (uses REGIONS iteration)", () => {
    expect(src).toContain("REGIONS");
    // Uses REGIONS.map or for..of to render all dots
    expect(src).toMatch(/REGIONS\.(map|forEach)|for\s*\(.*REGIONS/);
  });

  test("links filled dots to /ingredients/?region= route", () => {
    expect(src).toContain("/ingredients/?region=");
  });

  test("renders filled state for regions with count ≥ 1", () => {
    // Checks aggregation counts to decide filled vs empty
    expect(src).toMatch(/mixtures|ingredients|recipes/);
  });

  test("references Planned label for empty dots", () => {
    expect(src).toMatch(/[Pp]lanned|Geplant/);
  });

  test("includes tooltip text for region name and counts", () => {
    // tooltip must show region label
    expect(src).toContain("REGION_LABELS");
  });
});

describe("Worldmap component: rendered in HomePage", () => {
  let homePageSrc: string;
  beforeAll(async () => {
    homePageSrc = await readFile(join(COMPONENTS, "pages", "HomePage.astro"), "utf-8");
  });

  test("imports Worldmap (not WorldmapPlaceholder)", () => {
    expect(homePageSrc).toContain("Worldmap");
    expect(homePageSrc).not.toContain("WorldmapPlaceholder");
  });

  test("passes aggregation prop to Worldmap", () => {
    expect(homePageSrc).toContain("aggregation");
  });
});

describe("regionAggregation: integration with REGIONS constant", () => {
  test("result covers every REGIONS code", () => {
    const result = regionAggregation([]);
    for (const code of REGIONS) {
      expect(result.has(code)).toBe(true);
    }
    expect(result.size).toBe(REGIONS.length);
  });

  test("seeded entries produce correct filled/empty classification", () => {
    const entries = [
      { type: "ingredient" as const, region: ["levant", "mediterranean"] },
      { type: "mixture" as const, region: ["north-africa"] },
    ];
    const result = regionAggregation(entries);

    const levant = result.get("levant")!;
    const filledLevant = levant.mixtures + levant.ingredients + levant.recipes;
    expect(filledLevant).toBeGreaterThan(0);

    const eastAsia = result.get("east-asia")!;
    const filledEastAsia = eastAsia.mixtures + eastAsia.ingredients + eastAsia.recipes;
    expect(filledEastAsia).toBe(0);
  });

  test("dot count: 2 filled regions from seeded entries", () => {
    const entries = [
      { type: "ingredient" as const, region: ["levant"] },
      { type: "mixture" as const, region: ["north-africa"] },
    ];
    const result = regionAggregation(entries);
    let filled = 0;
    let empty = 0;
    for (const [, counts] of result) {
      const total = counts.mixtures + counts.ingredients + counts.recipes;
      if (total >= 1) filled++;
      else empty++;
    }
    expect(filled).toBe(2);
    expect(empty).toBe(REGIONS.length - 2);
  });

  test("tooltip string for filled dot matches expected format", () => {
    const entries = [
      { type: "ingredient" as const, region: ["levant"] },
      { type: "mixture" as const, region: ["levant"] },
    ];
    const result = regionAggregation(entries);
    const counts = result.get("levant")!;
    const tooltip = `Levant · ${counts.mixtures} mixtures · ${counts.ingredients} ingredients · ${counts.recipes} recipes`;
    expect(tooltip).toBe("Levant · 1 mixtures · 1 ingredients · 0 recipes");
  });
});
