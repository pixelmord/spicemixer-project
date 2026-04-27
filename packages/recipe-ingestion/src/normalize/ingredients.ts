// Ported from recipe_scrapers/_schemaorg.py:215-253 (ingredient/PropertyValue normalization)
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

import { asStr, normalizeString } from "../util/strings.ts";

function ingredientToString(item: unknown): string | null {
  if (typeof item === "string") {
    const s = normalizeString(item);
    return s || null;
  }
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const types = Array.isArray(o["@type"]) ? (o["@type"] as unknown[]) : [o["@type"]];

  if (types.includes("PropertyValue") || types.includes("ItemListElement")) {
    const parts = [asStr(o["value"]), asStr(o["unitText"]), asStr(o["name"])].filter(Boolean);
    return normalizeString(parts.join(" ")) || null;
  }

  return normalizeString(asStr(o["text"]) || asStr(o["name"]) || asStr(o["description"])) || null;
}

export function normalizeIngredients(raw: unknown): string[] {
  if (!raw) return [];
  const flat = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
  return flat.map(ingredientToString).filter((s): s is string => s !== null);
}
