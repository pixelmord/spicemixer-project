import type { ContentStore } from "./content-store.ts";
import type { RecipeCollection } from "./content-store.ts";
import type { MetaSidecar } from "./meta-sidecar.ts";
import { contentHash, flagTranslationsStale } from "./translation-sync.ts";

export interface SaveRecipeInput {
  collection: RecipeCollection;
  slug: string;
  recipe: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export async function saveRecipe(
  store: ContentStore,
  sidecar: MetaSidecar,
  input: SaveRecipeInput,
): Promise<{ slug: string }> {
  await store.put(input.collection, input.slug, input.recipe);
  if (input.meta !== undefined) {
    const ref = { collection: input.collection, slug: input.slug };
    const existing = await sidecar.read(ref);
    const existingData = (existing?.data as Record<string, unknown>) ?? {};
    const canonicalLocale =
      (existingData["canonicalLocale"] as string | undefined) ??
      (input.meta["locale"] as string | undefined);

    const mergedMeta: Record<string, unknown> = {
      ...input.meta,
      ...(canonicalLocale !== undefined && { canonicalLocale }),
    };

    const isCanonical = !mergedMeta["translationOf"];
    if (isCanonical) {
      const newHash = contentHash(input.recipe);
      const storedHash = existingData["canonicalContentHash"] as string | undefined;
      mergedMeta["canonicalContentHash"] = newHash;
      if (newHash !== storedHash) {
        await flagTranslationsStale(sidecar, input.collection, input.slug);
      }
    }

    await sidecar.write(ref, mergedMeta);
  }
  return { slug: input.slug };
}

export interface DeleteRecipeInput {
  collection: RecipeCollection;
  id: string;
}

export async function deleteRecipe(
  store: ContentStore,
  sidecar: MetaSidecar,
  input: DeleteRecipeInput,
): Promise<void> {
  await store.delete(input.collection, input.id);
  await sidecar.remove({ collection: input.collection, slug: input.id });
}

export interface PublishStateInput {
  collection: RecipeCollection;
  id: string;
}

async function setDraft(
  sidecar: MetaSidecar,
  input: PublishStateInput,
  draft: boolean,
): Promise<void> {
  const ref = { collection: input.collection, slug: input.id };
  const existing = await sidecar.read(ref);
  const meta = (existing?.data as Record<string, unknown>) ?? {};
  await sidecar.write(ref, { ...meta, draft });
}

export async function publishRecipe(
  _store: ContentStore,
  sidecar: MetaSidecar,
  input: PublishStateInput,
): Promise<void> {
  await setDraft(sidecar, input, false);
}

export async function unpublishRecipe(
  _store: ContentStore,
  sidecar: MetaSidecar,
  input: PublishStateInput,
): Promise<void> {
  await setDraft(sidecar, input, true);
}
