import type { ContentStore } from "./content-store.ts";
import type { RecipeCollection } from "./content-store.ts";

export interface SaveRecipeInput {
  collection: RecipeCollection;
  slug: string;
  recipe: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export async function saveRecipe(
  store: ContentStore,
  input: SaveRecipeInput,
): Promise<{ slug: string }> {
  await store.put(input.collection, input.slug, input.recipe);
  if (input.meta !== undefined) {
    const metaKey = `${input.collection}/${input.slug}`;
    const existing = await store.get("meta", metaKey);
    const existingData = (existing?.data as Record<string, unknown>) ?? {};
    const incomingMeta = input.meta as Record<string, unknown>;
    const existingCanonicalLocale = existingData["canonicalLocale"] as string | undefined;
    const incomingLocale = incomingMeta["locale"] as string | undefined;
    const metaToWrite: Record<string, unknown> = { ...incomingMeta };
    if (!existingCanonicalLocale && incomingLocale) {
      metaToWrite["canonicalLocale"] = incomingLocale;
    } else if (existingCanonicalLocale) {
      metaToWrite["canonicalLocale"] = existingCanonicalLocale;
    }
    await store.put("meta", metaKey, metaToWrite);
  }
  return { slug: input.slug };
}

export interface DeleteRecipeInput {
  collection: RecipeCollection;
  id: string;
}

export async function deleteRecipe(store: ContentStore, input: DeleteRecipeInput): Promise<void> {
  await store.delete(input.collection, input.id);
  await store.delete("meta", `${input.collection}/${input.id}`);
}

export interface PublishStateInput {
  collection: RecipeCollection;
  id: string;
}

async function setDraft(
  store: ContentStore,
  input: PublishStateInput,
  draft: boolean,
): Promise<void> {
  const metaId = `${input.collection}/${input.id}`;
  const existing = await store.get("meta", metaId);
  const meta = (existing?.data as Record<string, unknown>) ?? {};
  await store.put("meta", metaId, { ...meta, draft });
}

export async function publishRecipe(store: ContentStore, input: PublishStateInput): Promise<void> {
  await setDraft(store, input, false);
}

export async function unpublishRecipe(
  store: ContentStore,
  input: PublishStateInput,
): Promise<void> {
  await setDraft(store, input, true);
}
