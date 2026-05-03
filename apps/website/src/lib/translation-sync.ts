import { createHash } from "node:crypto";
import type { Collection, ContentStore, RecipeCollection } from "./content-store.ts";

type SyncCollection = "ingredients" | RecipeCollection;

function metaCollectionFor(collection: SyncCollection): Collection {
  return collection === "ingredients" ? "ingredientMeta" : "meta";
}

function metaTarget(collection: SyncCollection, key: string): [Collection, string] {
  return collection === "ingredients" ? ["ingredientMeta", key] : ["meta", `${collection}/${key}`];
}

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
  const metaCollection = metaCollectionFor(collection);
  const items = await store.list(metaCollection);

  for (const item of items) {
    if (metaCollection === "meta" && !item.id.startsWith(`${collection}/`)) continue;
    const data = item.data as Record<string, unknown>;
    if (data["translationOf"] !== canonicalKey) continue;
    if (data["translationStaleSince"] != null) continue;
    await store.put(metaCollection, item.id, { ...data, translationStaleSince: now });
  }
}

export async function clearStaleFlag(
  store: ContentStore,
  collection: SyncCollection,
  key: string,
): Promise<void> {
  const [metaCol, metaKey] = metaTarget(collection, key);
  const item = await store.get(metaCol, metaKey);
  if (item === null) return;
  const data = item.data as Record<string, unknown>;
  await store.put(
    metaCol,
    metaKey,
    Object.fromEntries(Object.entries(data).filter(([k]) => k !== "translationStaleSince")),
  );
}
