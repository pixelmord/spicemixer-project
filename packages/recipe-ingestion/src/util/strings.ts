// Ported from recipe_scrapers/_utils.py:294-320 (normalize_string)
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  divide: "÷",
  deg: "°",
  plusmn: "±",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
};

function decodeHtmlEntities(str: string): string {
  return str.replace(/&(?:([a-zA-Z]+)|(#\d+)|(#x[0-9a-fA-F]+));/g, (match, named, decimal, hex) => {
    if (named) return HTML_ENTITIES[named as string] ?? match;
    if (decimal) return String.fromCharCode(parseInt((decimal as string).slice(1), 10));
    if (hex) return String.fromCharCode(parseInt((hex as string).slice(2), 16));
    return match;
  });
}

/** Safely coerce an unknown JSON-LD value to string; objects become "". */
export function asStr(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function normalizeString(str: string): string {
  // Iteratively decode entities until stable
  let prev = "";
  let curr = str;
  while (prev !== curr) {
    prev = curr;
    curr = decodeHtmlEntities(curr);
  }

  // Strip HTML tags
  curr = curr.replace(/<[^>]*>/g, "");

  // Normalize whitespace variants
  curr = curr.replace(/\u00a0/g, " "); // non-breaking space
  curr = curr.replace(/\u200b/g, ""); // zero-width space
  curr = curr.replace(/\s+/g, " "); // collapse runs

  // Normalize double parentheses
  curr = curr.replace(/\(\(([^)]+)\)\)/g, "($1)");

  return curr.trim();
}
