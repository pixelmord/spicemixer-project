import { createHash } from "node:crypto";
import type { MetaSidecar, MetaRef, SyncCollection } from "./meta-sidecar.ts";

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
  sidecar: MetaSidecar,
  collection: SyncCollection,
  canonicalKey: string,
): Promise<void> {
  const now = new Date().toISOString();
  const items = await sidecar.listSync(collection);
  for (const { metaCollection, id, data } of items) {
    const d = data as Record<string, unknown>;
    if (d["translationOf"] !== canonicalKey) continue;
    if (d["translationStaleSince"] != null) continue;
    await sidecar.updateById(metaCollection, id, { ...d, translationStaleSince: now });
  }
}

function refFromKey(collection: SyncCollection, key: string): MetaRef {
  if (collection === "ingredients") {
    const slash = key.indexOf("/");
    return { collection, locale: key.slice(0, slash), slug: key.slice(slash + 1) };
  }
  return { collection, slug: key };
}

export async function clearStaleFlag(
  sidecar: MetaSidecar,
  collection: SyncCollection,
  key: string,
): Promise<void> {
  const ref = refFromKey(collection, key);
  const item = await sidecar.read(ref);
  if (item === null) return;
  const data = item.data as Record<string, unknown>;
  await sidecar.write(
    ref,
    Object.fromEntries(Object.entries(data).filter(([k]) => k !== "translationStaleSince")),
  );
}
