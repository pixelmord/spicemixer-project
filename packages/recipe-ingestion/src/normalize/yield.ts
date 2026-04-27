// Ported from recipe_scrapers/_utils.py:205-286 (get_yields)
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

export function normalizeYield(raw: unknown): string | number | undefined {
  if (raw === undefined || raw === null) return undefined;

  const items = Array.isArray(raw) ? raw : [raw];
  const candidate = items[0];

  if (typeof candidate === "number") return candidate;

  if (candidate && typeof candidate === "object") {
    const o = candidate as Record<string, unknown>;
    // QuantitativeValue: prefer maxValue (upper bound of a range) over value
    const value = o["maxValue"] ?? o["value"];
    const unit = o["unitText"];
    if (value !== undefined) {
      if (typeof value !== "string" && typeof value !== "number") return undefined;
      const v = String(value).trim();
      const u = typeof unit === "string" ? unit.trim() : undefined;
      return u ? `${v} ${u}` : v;
    }
  }

  if (typeof candidate === "string") return candidate;

  return undefined;
}
