import type { ContentStore } from "./content-store.ts";
import type { RecipeCollection } from "./content-store.ts";
import type { MetaSidecar } from "./meta-sidecar.ts";
import { entityMeta } from "@/lib/entity-meta.ts";

export interface DeleteRecipeInput {
  collection: RecipeCollection;
  locale: string;
  slug: string;
}

export async function deleteRecipe(
  store: ContentStore,
  sidecar: MetaSidecar,
  input: DeleteRecipeInput,
): Promise<void> {
  await store.delete(input.collection, `${input.locale}/${input.slug}`);
  await sidecar.remove({ collection: input.collection, locale: input.locale, slug: input.slug });
}

export interface PublishStateInput {
  collection: RecipeCollection;
  locale: string;
  slug: string;
}

async function setDraft(
  sidecar: MetaSidecar,
  input: PublishStateInput,
  draft: boolean,
): Promise<void> {
  const ref = { collection: input.collection, locale: input.locale, slug: input.slug };
  await entityMeta.merge(sidecar, ref, { draft });
}

export async function publishRecipe(sidecar: MetaSidecar, input: PublishStateInput): Promise<void> {
  await setDraft(sidecar, input, false);
}

export async function unpublishRecipe(
  sidecar: MetaSidecar,
  input: PublishStateInput,
): Promise<void> {
  await setDraft(sidecar, input, true);
}
