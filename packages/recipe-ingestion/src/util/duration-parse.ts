// Ported from recipe_scrapers/_utils.py:150-202 (get_minutes) and ISO-8601 parsing.
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

const ISO_DURATION_RE =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

function minutesToIso(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `PT${minutes}M`;
  if (minutes === 0) return `PT${hours}H`;
  return `PT${hours}H${minutes}M`;
}

function replaceUnicodeFractions(str: string): string {
  let result = str;
  for (const [frac, val] of Object.entries(UNICODE_FRACTIONS)) {
    // "1½" → "1.5" (mixed number: whole digit immediately before fraction)
    result = result.replace(new RegExp(`(\\d+)${frac}`, "g"), (_, whole) =>
      String(parseInt(whole, 10) + val),
    );
    // standalone "½" → "0.5"
    result = result.replaceAll(frac, String(val));
  }
  return result;
}

/** Collapse a range like "10-15" or "10 to 15" to the upper bound. */
function collapseRange(str: string): string {
  return str
    .replace(/(\d+(?:\.\d+)?)\s*(?:–|-)\s*(\d+(?:\.\d+)?)/g, "$2")
    .replace(/(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/gi, "$2");
}

function parseNaturalDuration(str: string): number | null {
  let processed = replaceUnicodeFractions(str);
  processed = collapseRange(processed);

  let totalMinutes = 0;
  let matched = false;

  const dayMatch = /(\d+(?:\.\d+)?)\s*(?:days?|d\b)/i.exec(processed);
  if (dayMatch) {
    totalMinutes += parseFloat(dayMatch[1]) * 24 * 60;
    matched = true;
  }

  const hourMatch = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i.exec(processed);
  if (hourMatch) {
    totalMinutes += parseFloat(hourMatch[1]) * 60;
    matched = true;
  }

  const minMatch = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m\b)/i.exec(processed);
  if (minMatch) {
    totalMinutes += parseFloat(minMatch[1]);
    matched = true;
  }

  return matched ? totalMinutes : null;
}

/**
 * Parse a duration value in any common format and return an ISO 8601 duration
 * string matching `/^PT(\d+H)?(\d+M)?$/`, or `null` if unparseable.
 *
 * Accepted inputs: "PT1H30M", "1 hour 30 minutes", "1.5 hours", "45 mins",
 * "1½ hours", "10-15 minutes" (upper bound taken).
 */
export function parseDuration(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const str = value.trim();
  if (!str) return null;

  // Already ISO 8601 — parse to minutes and re-emit in canonical form
  if (str.startsWith("P")) {
    const m = ISO_DURATION_RE.exec(str);
    if (m) {
      const weeks = parseFloat(m[3] ?? "0");
      const days = parseFloat(m[4] ?? "0");
      const hours = parseFloat(m[5] ?? "0");
      const mins = parseFloat(m[6] ?? "0");
      const secs = parseFloat(m[7] ?? "0");
      const total = weeks * 7 * 24 * 60 + days * 24 * 60 + hours * 60 + mins + secs / 60;
      return total > 0 ? minutesToIso(total) : null;
    }
  }

  const minutes = parseNaturalDuration(str);
  if (minutes !== null && minutes > 0) return minutesToIso(minutes);

  return null;
}
