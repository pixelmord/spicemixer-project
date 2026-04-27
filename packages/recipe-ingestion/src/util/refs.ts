// Ported from recipe_scrapers/_schemaorg.py:68-81 (@id reference resolution)
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

export type RefIndex = Map<string, Record<string, unknown>>;

function indexNode(obj: unknown, index: RefIndex): void {
  if (!obj || typeof obj !== "object") return;
  const o = obj as Record<string, unknown>;
  const id = o["@id"];
  // First-write-wins: the full entity (encountered in @graph) must not be overwritten
  // by a bare @id reference stub found later inside a property value.
  if (typeof id === "string" && !index.has(id)) index.set(id, o);
  for (const val of Object.values(o)) {
    if (Array.isArray(val)) {
      for (const item of val) indexNode(item, index);
    } else if (val && typeof val === "object") {
      indexNode(val, index);
    }
  }
}

export function buildRefIndex(roots: unknown[]): RefIndex {
  const index: RefIndex = new Map();
  for (const root of roots) indexNode(root, index);
  return index;
}
