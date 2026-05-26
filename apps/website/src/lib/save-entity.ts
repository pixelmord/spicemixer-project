import type { ContentStore } from "./content-store.ts";
import type { MetaSidecar, SyncCollection } from "./meta-sidecar.ts";
import { contentHash, flagTranslationsStale } from "./translation-sync.ts";
import { getConfig, collectionToKind, type ContentCollection } from "entity-kind";

export interface SaveEntityRef {
  collection: ContentCollection;
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

  // Sync copy-mode (non-translatable) fields to all other-locale variants of the same slug.
  // Runs regardless of whether meta is provided so even bare content saves stay in sync.
  if (ref.locale) {
    const kind = collectionToKind[ref.collection];
    const { nonTranslatableFields } = getConfig(kind);
    if (nonTranslatableFields.length > 0) {
      const allItems = await store.list(ref.collection);
      const slugSuffix = `/${ref.slug}`;
      for (const item of allItems) {
        if (item.id === id) continue;
        if (!item.id.endsWith(slugSuffix)) continue;
        const sibling = item.data as Record<string, unknown>;
        const updated: Record<string, unknown> = { ...sibling };
        for (const field of nonTranslatableFields) {
          if (field in content) {
            updated[field] = content[field];
          } else {
            delete updated[field];
          }
        }
        await store.put(ref.collection, item.id, updated);
      }
    }
  }

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

    // Merge translations bidirectionally: a stale form payload (translations: {}) must not
    // clobber back-links that aiCreateTranslation wrote to the sidecar after the form loaded.
    const mergedTranslations: Record<string, string> = {
      ...(existingData["translations"] as Record<string, string> | undefined),
      ...(meta["translations"] as Record<string, string> | undefined),
    };

    const mergedMeta: Record<string, unknown> = {
      ...existingData,
      ...meta,
      translations: mergedTranslations,
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
    const mergedTranslations: Record<string, string> = {
      ...(existingData["translations"] as Record<string, string> | undefined),
      ...(meta["translations"] as Record<string, string> | undefined),
    };
    await sidecar.write(ref, { ...existingData, ...meta, translations: mergedTranslations });
  }
}
