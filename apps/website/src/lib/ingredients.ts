import type { ContentStore } from "./content-store.ts";
import type { MetaSidecar } from "./meta-sidecar.ts";
import { entityMeta } from "@/lib/entity-meta.ts";

export type Locale = "en" | "de";

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
  await entityMeta.merge(sidecar, ref, input.patch);
}
