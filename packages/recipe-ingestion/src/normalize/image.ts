// Ported from recipe_scrapers/_schemaorg.py:195-213
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

function extractUrl(img: unknown): string | null {
  if (typeof img === "string") {
    return img.startsWith("http://") || img.startsWith("https://") ? img : null;
  }
  if (img && typeof img === "object") {
    const o = img as Record<string, unknown>;
    const url = o["url"] ?? o["contentUrl"];
    if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
      return url;
    }
  }
  return null;
}

export function normalizeImage(raw: unknown): string | string[] | undefined {
  if (!raw) return undefined;
  const items = Array.isArray(raw) ? raw : [raw];
  const urls = items.map(extractUrl).filter((u): u is string => u !== null);
  if (urls.length === 0) return undefined;
  return urls.length === 1 ? urls[0] : urls;
}
