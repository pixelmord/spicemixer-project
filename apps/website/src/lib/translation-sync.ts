import { createHash } from "node:crypto";
import type { ContentStore } from "./content-store.ts";
import type { RecipeCollection } from "./content-store.ts";

type SyncCollection = "ingredients" | RecipeCollection;

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, normalizeValue(obj[k])]),
    );
  }
  return value;
}

export function contentHash(record: Record<string, unknown>): string {
  const normalized = normalizeValue(record);
  const json = JSON.stringify(normalized);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

export async function flagTranslationsStale(
  store: ContentStore,
  collection: SyncCollection,
  canonicalKey: string,
): Promise<void> {
  const now = new Date().toISOString();

  if (collection === "ingredients") {
    const items = await store.list("ingredientMeta");
    for (const item of items) {
      const data = item.data as Record<string, unknown>;
      if (data["translationOf"] !== canonicalKey) continue;
      if (data["translationStaleSince"] != null) continue;
      await store.put("ingredientMeta", item.id, { ...data, translationStaleSince: now });
    }
  } else {
    const items = await store.list("meta");
    for (const item of items) {
      if (!item.id.startsWith(`${collection}/`)) continue;
      const data = item.data as Record<string, unknown>;
      if (data["translationOf"] !== canonicalKey) continue;
      if (data["translationStaleSince"] != null) continue;
      await store.put("meta", item.id, { ...data, translationStaleSince: now });
    }
  }
}

export async function clearStaleFlag(
  store: ContentStore,
  collection: SyncCollection,
  key: string,
): Promise<void> {
  if (collection === "ingredients") {
    const item = await store.get("ingredientMeta", key);
    if (item === null) return;
    const data = item.data as Record<string, unknown>;
    await store.put(
      "ingredientMeta",
      key,
      Object.fromEntries(Object.entries(data).filter(([k]) => k !== "translationStaleSince")),
    );
  } else {
    const metaKey = `${collection}/${key}`;
    const item = await store.get("meta", metaKey);
    if (item === null) return;
    const data = item.data as Record<string, unknown>;
    await store.put(
      "meta",
      metaKey,
      Object.fromEntries(Object.entries(data).filter(([k]) => k !== "translationStaleSince")),
    );
  }
}
