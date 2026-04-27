// Ported from recipe_scrapers/_schemaorg.py:42-111 (graph walking + type matching)
// MIT License, Copyright (c) 2015 The recipe-scrapers contributors

type JsonObj = Record<string, unknown>;

function isRecipe(obj: unknown): obj is JsonObj {
  if (!obj || typeof obj !== "object") return false;
  const type = (obj as JsonObj)["@type"];
  return Array.isArray(type) ? type.includes("Recipe") : type === "Recipe";
}

function findInNodes(nodes: unknown[]): JsonObj | null {
  for (const node of nodes) {
    if (isRecipe(node)) return node;
    if (node && typeof node === "object") {
      const n = node as JsonObj;
      const main = n["mainEntity"] ?? n["mainEntityOfPage"];
      if (isRecipe(main)) return main;
      if (main && typeof main === "object") {
        const nested = (main as JsonObj)["@graph"];
        if (Array.isArray(nested)) {
          const found = findInNodes(nested);
          if (found) return found;
        }
      }
    }
  }
  return null;
}

/**
 * Walk a list of JSON-LD root objects and return the first Recipe entity found.
 * Handles flat arrays, @graph containers, and WebPage mainEntity patterns.
 */
export function findRecipe(jsonLd: unknown[]): JsonObj | null {
  for (const item of jsonLd) {
    if (!item || typeof item !== "object") continue;
    const obj = item as JsonObj;

    if (isRecipe(obj)) return obj;

    const graph = obj["@graph"];
    if (Array.isArray(graph)) {
      const found = findInNodes(graph);
      if (found) return found;
    }

    const main = obj["mainEntity"] ?? obj["mainEntityOfPage"];
    if (isRecipe(main)) return main;
  }

  return null;
}
