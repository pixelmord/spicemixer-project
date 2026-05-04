import { createHash } from "node:crypto";
import {
  INGREDIENT_META,
  type MetaSidecar,
  type MetaRef,
  type SyncCollection,
} from "./meta-sidecar.ts";
import type { ContentStore } from "./content-store.ts";

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
  // recipes/mixtures: key is "locale/slug" after ADR 0009 migration
  const slash = key.indexOf("/");
  if (slash === -1) return { collection, locale: "", slug: key };
  return { collection, locale: key.slice(0, slash), slug: key.slice(slash + 1) };
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

export type StaleEntry = {
  collection: "ingredients" | "recipes" | "mixtures";
  key: string;
  slug: string;
  locale: string;
  staleSince: string;
  canonicalLocale: string | undefined;
};

export async function listStaleEntries(store: ContentStore): Promise<StaleEntry[]> {
  const result: StaleEntry[] = [];

  const ingredientMetas = await store.list(INGREDIENT_META);
  for (const item of ingredientMetas) {
    const data = item.data as Record<string, unknown>;
    if (!data["translationStaleSince"]) continue;
    const slash = item.id.indexOf("/");
    if (slash === -1) continue;
    result.push({
      collection: "ingredients",
      key: item.id,
      slug: item.id.slice(slash + 1),
      locale: item.id.slice(0, slash),
      staleSince: data["translationStaleSince"] as string,
      canonicalLocale: data["canonicalLocale"] as string | undefined,
    });
  }

  const metaItems = await store.list("meta");
  for (const item of metaItems) {
    const data = item.data as Record<string, unknown>;
    if (!data["translationStaleSince"]) continue;
    const firstSlash = item.id.indexOf("/");
    if (firstSlash === -1) continue;
    const prefix = item.id.slice(0, firstSlash);
    if (prefix !== "recipes" && prefix !== "mixtures") continue;
    // After ADR 0009: id is "kind/locale/slug". Before migration: "kind/slug".
    const rest = item.id.slice(firstSlash + 1); // "locale/slug" or just "slug"
    const secondSlash = rest.indexOf("/");
    let locale: string;
    let slug: string;
    let key: string;
    if (secondSlash !== -1) {
      locale = rest.slice(0, secondSlash);
      slug = rest.slice(secondSlash + 1);
      key = rest; // "locale/slug"
    } else {
      // Legacy flat format (pre-migration): fall back to data fields for locale
      locale =
        (data["locale"] as string | undefined) ?? (data["language"] as string | undefined) ?? "—";
      slug = rest;
      key = rest;
    }
    result.push({
      collection: prefix as "recipes" | "mixtures",
      key,
      slug,
      locale,
      staleSince: data["translationStaleSince"] as string,
      canonicalLocale: data["canonicalLocale"] as string | undefined,
    });
  }

  result.sort((a, b) => a.staleSince.localeCompare(b.staleSince));
  return result;
}
