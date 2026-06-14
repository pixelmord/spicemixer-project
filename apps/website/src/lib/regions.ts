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
