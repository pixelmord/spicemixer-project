import type { ContentStore } from "./content-store.ts";
import type { MetaSidecar } from "./meta-sidecar.ts";
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
  sidecar: MetaSidecar,
  input: SaveIngredientInput,
): Promise<{ slug: string }> {
  const ref = { collection: "ingredients" as const, locale: input.locale, slug: input.slug };
  await store.put("ingredients", `${input.locale}/${input.slug}`, input.ingredient);
  if (input.meta !== undefined) {
    const existing = await sidecar.read(ref);
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

    const isCanonical = !mergedMeta["translationOf"];
    if (isCanonical) {
      const newHash = contentHash(input.ingredient);
      const storedHash = existingData["canonicalContentHash"] as string | undefined;
      mergedMeta["canonicalContentHash"] = newHash;
      if (newHash !== storedHash) {
        await flagTranslationsStale(sidecar, "ingredients", `${input.locale}/${input.slug}`);
      }
    }

    await sidecar.write(ref, mergedMeta);
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
  sidecar: MetaSidecar,
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
  await sidecar.write(
    { collection: "ingredients", locale: input.locale, slug: input.slug },
    { draft: true, canonicalLocale: input.locale },
  );
  return { slug: input.slug };
}

export async function deleteIngredient(
  store: ContentStore,
  sidecar: MetaSidecar,
  input: { id: string },
): Promise<void> {
  await store.delete("ingredients", input.id);
  // id is "locale/slug" — parse for the sidecar ref
  const slash = input.id.indexOf("/");
  const locale = input.id.slice(0, slash);
  const slug = input.id.slice(slash + 1);
  await sidecar.remove({ collection: "ingredients", locale, slug });
}

export interface SaveIngredientMetaInput {
  locale: Locale;
  slug: string;
  patch: Record<string, unknown>;
}

export async function saveIngredientMeta(
  sidecar: MetaSidecar,
  input: SaveIngredientMetaInput,
): Promise<void> {
  const ref = { collection: "ingredients" as const, locale: input.locale, slug: input.slug };
  const existing = await sidecar.read(ref);
  await sidecar.write(ref, {
    ...((existing?.data as Record<string, unknown>) ?? {}),
    ...input.patch,
  });
}

export interface IngredientPublishStateInput {
  locale: Locale;
  slug: string;
}

async function setIngredientDraft(
  sidecar: MetaSidecar,
  input: IngredientPublishStateInput,
  draft: boolean,
): Promise<void> {
  const ref = { collection: "ingredients" as const, locale: input.locale, slug: input.slug };
  const existing = await sidecar.read(ref);
  const meta = (existing?.data as Record<string, unknown>) ?? {};
  await sidecar.write(ref, { ...meta, draft });
}

export async function publishIngredient(
  sidecar: MetaSidecar,
  input: IngredientPublishStateInput,
): Promise<void> {
  await setIngredientDraft(sidecar, input, false);
}

export async function unpublishIngredient(
  sidecar: MetaSidecar,
  input: IngredientPublishStateInput,
): Promise<void> {
  await setIngredientDraft(sidecar, input, true);
}
