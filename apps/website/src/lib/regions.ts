// REGIONS / RegionCode are owned by `entity-kind` (the content-validation
// source of truth). This module adds the presentation layer — labels and
// worldmap dot positions — so the two never drift out of sync.
export { REGIONS, type RegionCode } from "entity-kind";
import { REGIONS, type RegionCode } from "entity-kind";

export const REGION_LABELS: Record<RegionCode, { en: string; de: string }> = {
  "north-africa": { en: "North Africa", de: "Nordafrika" },
  "east-africa": { en: "East Africa", de: "Ostafrika" },
  "horn-of-africa": { en: "Horn of Africa", de: "Horn von Afrika" },
  "west-africa": { en: "West Africa", de: "Westafrika" },
  "southern-africa": { en: "Southern Africa", de: "Südliches Afrika" },
  levant: { en: "Levant", de: "Levante" },
  gulf: { en: "Arabian Gulf", de: "Arabischer Golf" },
  caucasus: { en: "Caucasus", de: "Kaukasus" },
  mediterranean: { en: "Mediterranean", de: "Mittelmeer" },
  "western-europe": { en: "Western Europe", de: "Westeuropa" },
  "central-europe": { en: "Central Europe", de: "Mitteleuropa" },
  "northern-europe": { en: "Northern Europe", de: "Nordeuropa" },
  "eastern-europe": { en: "Eastern Europe", de: "Osteuropa" },
  "central-asia": { en: "Central Asia", de: "Zentralasien" },
  "south-asia": { en: "South Asia", de: "Südasien" },
  "southeast-asia": { en: "Southeast Asia", de: "Südostasien" },
  "east-asia": { en: "East Asia", de: "Ostasien" },
  "north-america": { en: "North America", de: "Nordamerika" },
  mesoamerica: { en: "Mesoamerica", de: "Mesoamerika" },
  caribbean: { en: "Caribbean", de: "Karibik" },
  andean: { en: "Andean", de: "Andenraum" },
  "south-atlantic": { en: "South Atlantic", de: "Südatlantik" },
  oceania: { en: "Oceania", de: "Ozeanien" },
};

export const REGION_OPTIONS = REGIONS.map((code) => ({
  value: code,
  label: REGION_LABELS[code].en,
}));

// --- Region groups (presentation-only clusters; see CONTEXT.md → Group) ---
// A coarse grouping of regions used to organise the worldmap legend. Not a
// content enum, not queryable — display language only.
export type RegionGroup = "Africa" | "Middle East" | "Europe" | "Asia" | "Americas" | "Oceania";

export const REGION_GROUPS: Record<RegionCode, RegionGroup> = {
  "north-africa": "Africa",
  "west-africa": "Africa",
  "east-africa": "Africa",
  "horn-of-africa": "Africa",
  "southern-africa": "Africa",
  levant: "Middle East",
  gulf: "Middle East",
  caucasus: "Middle East",
  mediterranean: "Europe",
  "western-europe": "Europe",
  "central-europe": "Europe",
  "northern-europe": "Europe",
  "eastern-europe": "Europe",
  "central-asia": "Asia",
  "south-asia": "Asia",
  "southeast-asia": "Asia",
  "east-asia": "Asia",
  "north-america": "Americas",
  mesoamerica: "Americas",
  caribbean: "Americas",
  andean: "Americas",
  "south-atlantic": "Americas",
  oceania: "Oceania",
};

// Per-region dot colors for the worldmap. Shaded within each group so a
// continent reads as one colour family while regions stay distinguishable.
export const REGION_COLORS: Record<RegionCode, string> = {
  "north-africa": "#C0670A",
  "west-africa": "#B5470B",
  "east-africa": "#A33D09",
  "horn-of-africa": "#8C3207",
  "southern-africa": "#7A2C06",
  levant: "#2E6B8A",
  gulf: "#1F5273",
  caucasus: "#174861",
  mediterranean: "#5B8C3E",
  "western-europe": "#4A7A30",
  "central-europe": "#3D6828",
  "northern-europe": "#2F5220",
  "eastern-europe": "#234016",
  "central-asia": "#7B5EA7",
  "south-asia": "#6A4D94",
  "southeast-asia": "#593D81",
  "east-asia": "#472D6E",
  "north-america": "#D4A017",
  mesoamerica: "#C08A10",
  caribbean: "#A8740D",
  andean: "#8F5E0A",
  "south-atlantic": "#764808",
  oceania: "#2A7A6E",
};

// One representative colour per group, for the legend swatches.
export const GROUP_COLORS: Record<RegionGroup, string> = {
  Africa: "#B5470B",
  "Middle East": "#1F5273",
  Europe: "#4A7A30",
  Asia: "#6A4D94",
  Americas: "#C08A10",
  Oceania: "#2A7A6E",
};

// Legend order: groups in a stable display order.
export const GROUP_ORDER: RegionGroup[] = [
  "Americas",
  "Europe",
  "Africa",
  "Middle East",
  "Asia",
  "Oceania",
];

// Placeholder — will be refined when the SVG worldmap asset is designed.
export const DOT_POSITIONS: Record<RegionCode, { x: number; y: number }> = {
  "north-africa": { x: 47, y: 32 },
  "east-africa": { x: 54, y: 45 },
  "horn-of-africa": { x: 59, y: 40 },
  "west-africa": { x: 38, y: 43 },
  "southern-africa": { x: 52, y: 60 },
  levant: { x: 57, y: 30 },
  gulf: { x: 62, y: 35 },
  caucasus: { x: 60, y: 25 },
  mediterranean: { x: 50, y: 26 },
  "western-europe": { x: 44, y: 20 },
  "central-europe": { x: 49, y: 19 },
  "northern-europe": { x: 47, y: 13 },
  "eastern-europe": { x: 55, y: 16 },
  "central-asia": { x: 67, y: 26 },
  "south-asia": { x: 68, y: 37 },
  "southeast-asia": { x: 78, y: 44 },
  "east-asia": { x: 80, y: 28 },
  "north-america": { x: 18, y: 22 },
  mesoamerica: { x: 18, y: 38 },
  caribbean: { x: 23, y: 37 },
  andean: { x: 22, y: 52 },
  "south-atlantic": { x: 27, y: 60 },
  oceania: { x: 86, y: 64 },
};
