import type { ContentStore } from "./content-store.ts";

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
    await store.put("ingredientMeta", key, {
      ...((existing?.data as Record<string, unknown>) ?? {}),
      ...input.meta,
    });
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
    origin: [],
    flavorNotes: [],
    pairings: [],
  });
  await store.put("ingredientMeta", `${input.locale}/${input.slug}`, { draft: true });
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
