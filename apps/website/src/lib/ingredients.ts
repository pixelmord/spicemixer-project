import type { ContentStore } from "./content-store.ts";
import { contentHash, flagTranslationsStale } from "./translation-sync.ts";

export type Locale = "en" | "de";

export interface SaveIngredientInput {
  locale: Locale;
  slug: string;
  ingredient: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export async function saveIngredient(
  store: ContentStore,
  input: SaveIngredientInput,
): Promise<{ slug: string }> {
  const key = `${input.locale}/${input.slug}`;
  await store.put("ingredients", key, input.ingredient);
  if (input.meta !== undefined) {
    const existing = await store.get("ingredientMeta", key);
    const existingData = (existing?.data as Record<string, unknown>) ?? {};
    const canonicalLocale =
      (existingData["canonicalLocale"] as string | undefined) ??
      (input.meta["canonicalLocale"] as string | undefined) ??
      input.locale;

    const mergedMeta: Record<string, unknown> = {
      ...existingData,
      ...input.meta,
      canonicalLocale,
    };

    // Flag translations stale when a canonical entry's content hash changes.
    // Canonical = no translationOf. Translation-side saves never flag the canonical.
    const isCanonical = !mergedMeta["translationOf"];
    if (isCanonical) {
      const newHash = contentHash(input.ingredient);
      const storedHash = existingData["canonicalContentHash"] as string | undefined;
      mergedMeta["canonicalContentHash"] = newHash;
      if (newHash !== storedHash) {
        await flagTranslationsStale(store, "ingredients", key);
      }
    }

    await store.put("ingredientMeta", key, mergedMeta);
  }
  return { slug: input.slug };
}

export interface QuickCreateIngredientInput {
  locale: Locale;
  slug: string;
  name: string;
  category: string;
}

export async function quickCreateIngredient(
  store: ContentStore,
  input: QuickCreateIngredientInput,
): Promise<{ slug: string }> {
  await store.put("ingredients", `${input.locale}/${input.slug}`, {
    name: input.name,
    category: input.category,
    images: [],
    origin: [],
    flavorNotes: [],
    pairings: [],
  });
  await store.put("ingredientMeta", `${input.locale}/${input.slug}`, {
    draft: true,
    canonicalLocale: input.locale,
  });
  return { slug: input.slug };
}

export async function deleteIngredient(store: ContentStore, input: { id: string }): Promise<void> {
  await store.delete("ingredients", input.id);
  await store.delete("ingredientMeta", input.id);
}

export interface SaveIngredientMetaInput {
  locale: Locale;
  slug: string;
  patch: Record<string, unknown>;
}

export async function saveIngredientMeta(
  store: ContentStore,
  input: SaveIngredientMetaInput,
): Promise<void> {
  const key = `${input.locale}/${input.slug}`;
  const existing = await store.get("ingredientMeta", key);
  await store.put("ingredientMeta", key, {
    ...((existing?.data as Record<string, unknown>) ?? {}),
    ...input.patch,
  });
}

export interface IngredientPublishStateInput {
  locale: Locale;
  slug: string;
}

async function setIngredientDraft(
  store: ContentStore,
  input: IngredientPublishStateInput,
  draft: boolean,
): Promise<void> {
  const key = `${input.locale}/${input.slug}`;
  const existing = await store.get("ingredientMeta", key);
  const meta = (existing?.data as Record<string, unknown>) ?? {};
  await store.put("ingredientMeta", key, { ...meta, draft });
}

export async function publishIngredient(
  store: ContentStore,
  input: IngredientPublishStateInput,
): Promise<void> {
  await setIngredientDraft(store, input, false);
}

export async function unpublishIngredient(
  store: ContentStore,
  input: IngredientPublishStateInput,
): Promise<void> {
  await setIngredientDraft(store, input, true);
}
