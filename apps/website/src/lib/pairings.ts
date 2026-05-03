import type { ContentStore } from "./content-store.ts";
import type { MetaSidecar } from "./meta-sidecar.ts";
import type { EntityRef } from "./entity-ref.ts";
import { NotFoundError } from "./errors.ts";

export interface SavePairingInput {
  id: string;
  ingredients: [EntityRef, EntityRef];
  description: string;
  locale: string;
  draft?: boolean;
  image?: string;
}

export async function savePairing(
  store: ContentStore,
  input: SavePairingInput,
): Promise<{ id: string }> {
  const canonical = [...input.ingredients].sort((a, b) => a.slug.localeCompare(b.slug)) as [
    EntityRef,
    EntityRef,
  ];
  const existing = await store.get("pairings", input.id);
  const existingData = (existing?.data as Record<string, unknown>) ?? {};
  const existingDescriptions =
    (existingData["descriptions"] as Record<string, string>) ??
    (existingData["description"] ? { en: String(existingData["description"]) } : {});
  const existingDraft = (existingData["draft"] as boolean) ?? false;
  // image: explicit value wins; undefined = preserve existing; "" = clear
  const imageValue =
    input.image !== undefined ? input.image : (existingData["image"] as string | undefined);
  const data: Record<string, unknown> = {
    ingredients: canonical,
    descriptions: { ...existingDescriptions, [input.locale]: input.description },
    draft: input.draft !== undefined ? input.draft : existingDraft,
  };
  if (imageValue) data["image"] = imageValue;
  await store.put("pairings", input.id, data);
  return { id: input.id };
}

export async function togglePairingDraft(
  store: ContentStore,
  input: { id: string; draft: boolean },
): Promise<void> {
  const existing = await store.get("pairings", input.id);
  if (!existing) throw new NotFoundError(`Pairing ${input.id} not found.`);
  await store.put("pairings", input.id, {
    ...(existing.data as Record<string, unknown>),
    draft: input.draft,
  });
}

export async function deletePairing(
  store: ContentStore,
  sidecar: MetaSidecar,
  input: { id: string },
): Promise<void> {
  await store.delete("pairings", input.id);
  await sidecar.remove({ collection: "pairings", slug: input.id });
}

export async function savePairingMeta(
  sidecar: MetaSidecar,
  input: { id: string; patch: Record<string, unknown> },
): Promise<void> {
  const ref = { collection: "pairings" as const, slug: input.id };
  const existing = await sidecar.read(ref);
  await sidecar.write(ref, {
    ...((existing?.data as Record<string, unknown>) ?? {}),
    ...input.patch,
  });
}
