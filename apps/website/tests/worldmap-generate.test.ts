import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { REGIONS } from "../src/lib/regions.ts";
import {
  buildDots,
  classifyRegion,
  parseStaticGrid,
  SCALE,
  WORLDMAP_COLS,
  WORLDMAP_ROWS,
  type Continent,
} from "../src/lib/worldmap-generate.ts";

const STATIC_HTML = readFileSync(
  fileURLToPath(new URL("../src/components/worldmap-static/index.html", import.meta.url)),
  "utf8",
);

const REGION_SET = new Set<string>(REGIONS);

describe("classifyRegion", () => {
  test("returns null for water", () => {
    expect(classifyRegion(1, 1, "water")).toBeNull();
  });

  test("maps every continent's representative cell to a valid region", () => {
    const samples: Array<[number, number, Continent]> = [
      [8, 5, "north-america"],
      [20, 14, "north-america"], // tail → mesoamerica
      [30, 18, "south-america"],
      [5, 33, "europe"],
      [20, 32, "africa"],
      [9, 60, "asia"],
      [30, 58, "australia"],
    ];
    for (const [r, c, cont] of samples) {
      const region = classifyRegion(r, c, cont);
      expect(region, `${cont} @ ${r},${c}`).not.toBeNull();
      expect(REGION_SET.has(region!)).toBe(true);
    }
  });

  test("classifies the North American tail as mesoamerica and the bulk as north-america", () => {
    expect(classifyRegion(8, 5, "north-america")).toBe("north-america");
    expect(classifyRegion(20, 14, "north-america")).toBe("mesoamerica");
  });

  test("classifies the Australian continent as oceania", () => {
    expect(classifyRegion(28, 56, "australia")).toBe("oceania");
  });
});

describe("buildDots", () => {
  const grid = parseStaticGrid(STATIC_HTML);
  const dots = buildDots(grid);

  test("parses the source grid", () => {
    expect(grid.size).toBeGreaterThan(2000);
  });

  test("emits SCALE×SCALE fine dots per classified coarse land cell", () => {
    let landCells = 0;
    for (const [key, cont] of grid) {
      const [r, c] = key.split(",").map(Number);
      if (classifyRegion(r, c, cont) !== null) landCells++;
    }
    expect(dots.length).toBe(landCells * SCALE * SCALE);
  });

  test("places every dot inside the fine grid bounds", () => {
    for (const d of dots) {
      expect(d.col).toBeGreaterThanOrEqual(0);
      expect(d.col).toBeLessThan(WORLDMAP_COLS);
      expect(d.row).toBeGreaterThanOrEqual(0);
      expect(d.row).toBeLessThan(WORLDMAP_ROWS);
    }
  });

  test("only emits valid region ids (no water)", () => {
    for (const d of dots) expect(REGION_SET.has(d.regionId)).toBe(true);
  });

  test("has no duplicate coordinates", () => {
    const seen = new Set(dots.map((d) => `${d.col},${d.row}`));
    expect(seen.size).toBe(dots.length);
  });

  test("covers a broad spread of regions", () => {
    const regions = new Set(dots.map((d) => d.regionId));
    // The coarse source can't resolve all 23, but should hit most continents.
    expect(regions.size).toBeGreaterThanOrEqual(15);
  });
});
