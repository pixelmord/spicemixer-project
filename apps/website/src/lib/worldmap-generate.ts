// Layer-1 worldmap generation logic (see ADR 0021).
//
// The source silhouette (`worldmap-static/index.html`) is a coarse 38×68 grid
// that only knows *continents*. This module subdivides each continent's land
// cells into one of the 23 culinary regions via a hand-authored boundary table,
// then upscales the grid 2× (each coarse cell → a 2×2 block) carrying the
// region id. The result is a flat list of land dots in a 76×136 fine grid.
//
// Boundaries are authored against the native 38×68 coordinates and are a
// best-effort approximation — the source has no sub-continental data, so expect
// to visually tune the ranges below. Pure + deterministic so it can be tested
// and re-run by `scripts/gen-worldmap-dots.ts`.
import type { RegionCode } from "./regions.ts";

export const COARSE_COLS = 68;
export const COARSE_ROWS = 38;
export const SCALE = 2;
export const WORLDMAP_COLS = COARSE_COLS * SCALE; // 136
export const WORLDMAP_ROWS = COARSE_ROWS * SCALE; // 76

/** A single land dot in the fine (76×136) grid. Coordinates are 0-indexed. */
export interface WorldmapDot {
  col: number;
  row: number;
  regionId: RegionCode;
}

/** The coarse continent classes used by the source silhouette. */
export type Continent =
  | "north-america"
  | "south-america"
  | "europe"
  | "africa"
  | "asia"
  | "australia"
  | "water";

/**
 * Assign a coarse land cell (1-indexed, matching the source `rNdM` grid) to a
 * culinary region. Returns `null` for water or anything unclassifiable.
 */
export function classifyRegion(row: number, col: number, continent: Continent): RegionCode | null {
  switch (continent) {
    case "water":
      return null;

    case "north-america":
      // Southern tail (Mexico / Central America) narrows below row 18.
      if (row >= 18) return "mesoamerica";
      return "north-america";

    case "south-america":
      // Northern tip reads as Caribbean coast; west edge is the Andes.
      if (row <= 23) return "caribbean";
      return col <= 18 ? "andean" : "south-atlantic";

    case "europe":
      if (row <= 8) return "northern-europe"; // Scandinavia / north
      if (row >= 16) return "mediterranean"; // southern coast
      if (col <= 34) return "western-europe";
      if (col <= 38) return "central-europe";
      return "eastern-europe";

    case "africa":
      if (row <= 21) return "north-africa"; // Sahara / Maghreb band
      if (row >= 27) return "southern-africa";
      // Mid band (rows 22–26): split E/W, with the eastern protrusion as Horn.
      if (col >= 39) return "horn-of-africa";
      if (col >= 35) return "east-africa";
      return "west-africa";

    case "asia": {
      // Western Asia (Middle East + Caucasus + Caspian).
      if (col <= 46) {
        if (row <= 12) return "central-asia"; // Caspian / Kazakh steppe
        if (row <= 16) return "caucasus";
        if (row <= 20 && col <= 42) return "levant";
        return "gulf"; // Arabian peninsula
      }
      // Central / Eastern Asia.
      if (col >= 55) {
        return row >= 19 ? "southeast-asia" : "east-asia";
      }
      // Middle columns (47–54).
      if (row <= 12) return "central-asia";
      if (row >= 22) return "southeast-asia";
      return "south-asia"; // Indian subcontinent
    }

    case "australia":
      return "oceania";

    default:
      return null;
  }
}

/**
 * Parse the source silhouette HTML into a coarse grid. Keyed `"row,col"`
 * (1-indexed) → continent class.
 */
export function parseStaticGrid(html: string): Map<string, Continent> {
  const grid = new Map<string, Continent>();
  const re = /r(\d+)d(\d+)\s+([a-z-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const row = Number(m[1]);
    const col = Number(m[2]);
    grid.set(`${row},${col}`, m[3] as Continent);
  }
  return grid;
}

/**
 * Build the fine-grid land-dot list from a parsed coarse grid: classify each
 * coarse land cell, then expand it into a SCALE×SCALE block of fine dots.
 * Output is sorted row-major for stable diffs.
 */
export function buildDots(grid: Map<string, Continent>): WorldmapDot[] {
  const dots: WorldmapDot[] = [];
  for (const [key, continent] of grid) {
    const [row, col] = key.split(",").map(Number);
    const regionId = classifyRegion(row, col, continent);
    if (regionId === null) continue;
    for (let dr = 0; dr < SCALE; dr++) {
      for (let dc = 0; dc < SCALE; dc++) {
        dots.push({
          col: (col - 1) * SCALE + dc,
          row: (row - 1) * SCALE + dr,
          regionId,
        });
      }
    }
  }
  dots.sort((a, b) => a.row - b.row || a.col - b.col);
  return dots;
}
