import type { ContentStore } from "./content-store.ts";
import type { MetaSidecar, SyncCollection } from "./meta-sidecar.ts";
import { contentHash, flagTranslationsStale } from "./translation-sync.ts";
import { getConfig, collectionToKind } from "entity-kind";

export interface SaveEntityRef {
  collection: "recipes" | "mixtures" | "ingredients" | "pairings";
  locale?: string;
  slug: string;
}

export async function saveEntity(
  store: ContentStore,
  sidecar: MetaSidecar,
  {
    ref,
    content,
    meta,
  }: {
    ref: SaveEntityRef;
    content: Record<string, unknown>;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const id = ref.locale ? `${ref.locale}/${ref.slug}` : ref.slug;
  await store.put(ref.collection, id, content);

  if (meta === undefined) return;

  const kind = collectionToKind[ref.collection];
  const config = getConfig(kind);
  const canonicalKeyFn = config.translationCanonicalKey;

  const existing = await sidecar.read(ref);
  const existingData = (existing?.data as Record<string, unknown>) ?? {};

  if (canonicalKeyFn !== null) {
    const locale = ref.locale ?? "";
    const canonicalKey = canonicalKeyFn(locale, ref.slug);

    const canonicalLocale =
      (existingData["canonicalLocale"] as string | undefined) ??
      (meta["canonicalLocale"] as string | undefined) ??
      (meta["locale"] as string | undefined) ??
      ref.locale;

    const mergedMeta: Record<string, unknown> = {
      ...existingData,
      ...meta,
      ...(canonicalLocale !== undefined && { canonicalLocale }),
    };

    const isCanonical = !mergedMeta["translationOf"];
    if (isCanonical) {
      const newHash = contentHash(content);
      const storedHash = existingData["canonicalContentHash"] as string | undefined;
      mergedMeta["canonicalContentHash"] = newHash;
      if (newHash !== storedHash) {
        await flagTranslationsStale(sidecar, ref.collection as SyncCollection, canonicalKey);
      }
    }

    await sidecar.write(ref, mergedMeta);
  } else {
    await sidecar.write(ref, { ...existingData, ...meta });
  }
}
