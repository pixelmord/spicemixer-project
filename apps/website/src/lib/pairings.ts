import type { ContentStore } from "./content-store.ts";
import type { MetaSidecar } from "./meta-sidecar.ts";
import type { EntityRef } from "./entity-ref.ts";
import { NotFoundError } from "./errors.ts";

export interface BuildPairingDataInput {
  id: string;
  ingredients: [EntityRef, EntityRef];
  description: string;
  locale: string;
  image?: string;
  imageAttribution?: Record<string, unknown>;
}

export async function buildPairingData(
  store: ContentStore,
  input: BuildPairingDataInput,
): Promise<Record<string, unknown>> {
  const canonical = [...input.ingredients].sort((a, b) => a.slug.localeCompare(b.slug)) as [
    EntityRef,
    EntityRef,
  ];
  const existing = await store.get("pairings", input.id);
  const existingData = (existing?.data as Record<string, unknown>) ?? {};
  const existingDescriptions =
    (existingData["descriptions"] as Record<string, string>) ??
    (typeof existingData["description"] === "string" ? { en: existingData["description"] } : {});
  // image / imageAttribution: explicit value wins; undefined = preserve existing; "" = clear
  const imageValue =
    input.image !== undefined ? input.image : (existingData["image"] as string | undefined);
  const imageAttributionValue =
    input.imageAttribution !== undefined
      ? input.imageAttribution
      : (existingData["imageAttribution"] as Record<string, unknown> | undefined);
  const data: Record<string, unknown> = {
    ingredients: canonical,
    descriptions: { ...existingDescriptions, [input.locale]: input.description },
  };
  if (imageValue) data["image"] = imageValue;
  if (imageAttributionValue) data["imageAttribution"] = imageAttributionValue;
  return data;
}

export async function togglePairingDraft(
  store: ContentStore,
  sidecar: MetaSidecar,
  input: { id: string; draft: boolean },
): Promise<void> {
  const existing = await store.get("pairings", input.id);
  if (!existing) throw new NotFoundError(`Pairing ${input.id} not found.`);
  await savePairingMeta(sidecar, { id: input.id, patch: { draft: input.draft } });
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
    ...(existing?.data as Record<string, unknown>),
    ...input.patch,
  });
}
