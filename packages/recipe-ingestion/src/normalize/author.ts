// Ported from recipe_scrapers/_schemaorg.py:143-149 (@id reference resolution for author)
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

import type { RefIndex } from "../util/refs.ts";
import { asStr, normalizeString } from "../util/strings.ts";

type PersonOrOrg = {
  "@type": "Person" | "Organization";
  name: string;
  url?: string;
};

function normalizeOne(item: unknown, refs: RefIndex): PersonOrOrg | null {
  // Resolve @id reference when no other data is present
  let obj: unknown = item;
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (typeof o["@id"] === "string" && !o["name"]) {
      const resolved = refs.get(o["@id"]);
      if (resolved) obj = resolved;
    }
  }

  if (typeof obj === "string") {
    const name = normalizeString(obj);
    return name ? { "@type": "Person", name } : null;
  }

  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const name = normalizeString(asStr(o["name"]));
  if (!name) return null;

  const type: "Person" | "Organization" = o["@type"] === "Organization" ? "Organization" : "Person";
  const url = typeof o["url"] === "string" ? o["url"] : undefined;
  const result: PersonOrOrg = { "@type": type, name };
  if (url) result.url = url;
  return result;
}

export function normalizeAuthor(
  raw: unknown,
  refs: RefIndex,
): PersonOrOrg | PersonOrOrg[] | undefined {
  if (!raw) return undefined;
  const items = Array.isArray(raw) ? raw : [raw];
  const normalized = items
    .map((item) => normalizeOne(item, refs))
    .filter((a): a is PersonOrOrg => a !== null);
  if (normalized.length === 0) return undefined;
  return normalized.length === 1 ? normalized[0] : normalized;
}
