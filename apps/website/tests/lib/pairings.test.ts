import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar, PAIRING_META } from "../../src/lib/meta-sidecar.ts";
import { buildPairingData, savePairingMeta } from "../../src/lib/pairings.ts";
import { saveEntity } from "../../src/lib/save-entity.ts";
import type { EndpointRef } from "entity-kind";

const cardamom: EndpointRef = { collection: "ingredients", slug: "cardamom" };
const anise: EndpointRef = { collection: "ingredients", slug: "anise" };
const harissa: EndpointRef = { collection: "mixtures", slug: "harissa" };

async function savePairing(
  store: InMemoryStore,
  sidecar: ReturnType<typeof createMetaSidecar>,
  input: {
    id: string;
    locale: string;
    endpoints: [EndpointRef, EndpointRef];
    description: string;
    draft?: boolean;
    image?: string;
    imageAttribution?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const content = await buildPairingData(store, input);
  await saveEntity(store, sidecar, {
    ref: { collection: "pairings", locale: input.locale, slug: input.id },
    content,
    meta: input.draft !== undefined ? { draft: input.draft } : undefined,
  });
  return { id: input.id };
}

describe("buildPairingData + saveEntity", () => {
  test("canonicalizes endpoint order alphabetically by slug", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await savePairing(store, sidecar, {
      id: "cardamom--anise",
      locale: "en",
      endpoints: [cardamom, anise],
      description: "Warm and licorice-y.",
    });
    const stored = await store.get("pairings", "en/cardamom--anise");
    const eps = (stored!.data as Record<string, unknown>)["endpoints"] as EndpointRef[];
    expect(eps[0]?.slug).toBe("anise");
    expect(eps[1]?.slug).toBe("cardamom");
  });

  test("stores full EndpointRef objects", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await savePairing(store, sidecar, {
      id: "harissa--cardamom",
      locale: "en",
      endpoints: [harissa, cardamom],
      description: "Spicy warmth.",
    });
    const stored = await store.get("pairings", "en/harissa--cardamom");
    const eps = (stored!.data as Record<string, unknown>)["endpoints"] as EndpointRef[];
    expect(eps[0]).toEqual({ collection: "ingredients", slug: "cardamom" });
    expect(eps[1]).toEqual({ collection: "mixtures", slug: "harissa" });
  });

  test("cross-collection pair: mixture endpoint alongside ingredient endpoint", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await savePairing(store, sidecar, {
      id: "cardamom--harissa",
      locale: "en",
      endpoints: [cardamom, harissa],
      description: "Spicy warmth.",
    });
    const stored = await store.get("pairings", "en/cardamom--harissa");
    expect(stored).not.toBeNull();
    const eps = (stored!.data as Record<string, unknown>)["endpoints"] as EndpointRef[];
    expect(eps).toHaveLength(2);
    expect(eps.map((r) => r.collection)).toContain("mixtures");
    expect(eps.map((r) => r.collection)).toContain("ingredients");
  });

  test("stores single description string (per-locale shape)", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "Warm and licorice-y.",
    });
    const stored = await store.get("pairings", "en/anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["description"]).toBe("Warm and licorice-y.");
    expect((stored!.data as Record<string, unknown>)["descriptions"]).toBeUndefined();
  });

  test("stores content under locale-prefixed id", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "de",
      endpoints: [anise, cardamom],
      description: "Warm und lakritzartig.",
    });
    const stored = await store.get("pairings", "de/anise--cardamom");
    expect(stored).not.toBeNull();
    expect((stored!.data as Record<string, unknown>)["description"]).toBe("Warm und lakritzartig.");
    // EN record must NOT be auto-created
    expect(await store.get("pairings", "en/anise--cardamom")).toBeNull();
  });

  test("preserves existing image when image is not supplied", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("pairings", "en/anise--cardamom", {
      endpoints: [anise, cardamom],
      description: "x",
      image: "https://example.com/img.jpg",
    });
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "y",
    });
    const stored = await store.get("pairings", "en/anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["image"]).toBe("https://example.com/img.jpg");
  });

  test("savePairingMeta merge-patches existing meta at locale-prefixed key", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(PAIRING_META, "en/anise--cardamom", {
      aiEvents: [],
    });
    await savePairingMeta(sidecar, {
      id: "anise--cardamom",
      locale: "en",
      patch: { aiSuggestions: { en: { contentHash: "abc" } } },
    });
    const meta = await store.get(PAIRING_META, "en/anise--cardamom");
    expect(meta?.data).toEqual({
      aiEvents: [],
      aiSuggestions: { en: { contentHash: "abc" } },
    });
  });

  test("saves imageAttribution in pairing content", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const attribution = {
      source: "Openverse",
      sourceUrl: "https://openverse.org",
      creator: "Test Photographer",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      attribution: "Test Photographer via Openverse (CC BY 2.0)",
    };
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "Warm and licorice-y.",
      imageAttribution: attribution,
    });
    const stored = await store.get("pairings", "en/anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["imageAttribution"]).toEqual(attribution);
  });

  test("preserves imageAttribution when only description changes", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const attribution = {
      source: "Openverse",
      sourceUrl: "https://openverse.org",
      creator: "Test Photographer",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      attribution: "Test Photographer via Openverse (CC BY 2.0)",
    };
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "Warm and licorice-y.",
      imageAttribution: attribution,
    });
    // Second save in DE locale, no imageAttribution — should NOT preserve EN's image
    // (each locale is an independent record; image is locale-scoped)
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "de",
      endpoints: [anise, cardamom],
      description: "Warm und lakritzartig.",
    });
    const storedEn = await store.get("pairings", "en/anise--cardamom");
    expect((storedEn!.data as Record<string, unknown>)["imageAttribution"]).toEqual(attribution);
    const storedDe = await store.get("pairings", "de/anise--cardamom");
    expect((storedDe!.data as Record<string, unknown>)["imageAttribution"]).toBeUndefined();
  });

  test("routes draft=true to pairingMeta sidecar at locale key, not content", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "Warm and licorice-y.",
      draft: true,
    });
    const stored = await store.get("pairings", "en/anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["draft"]).toBeUndefined();
    const meta = await store.get(PAIRING_META, "en/anise--cardamom");
    expect((meta!.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("save without draft leaves existing meta draft untouched", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(PAIRING_META, "en/anise--cardamom", { aiEvents: [], draft: true });
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "y",
    });
    const meta = await store.get(PAIRING_META, "en/anise--cardamom");
    expect((meta!.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("does not stamp canonicalLocale on pairingMeta (pairings excluded per ADR 0003)", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "Warm and licorice-y.",
    });
    const meta = await store.get(PAIRING_META, "en/anise--cardamom");
    expect(meta).toBeNull();
  });

  test("clears image when empty string is supplied", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("pairings", "en/anise--cardamom", {
      endpoints: [anise, cardamom],
      description: "x",
      image: "https://example.com/img.jpg",
    });
    await savePairing(store, sidecar, {
      id: "anise--cardamom",
      locale: "en",
      endpoints: [anise, cardamom],
      description: "y",
      image: "",
    });
    const stored = await store.get("pairings", "en/anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["image"]).toBeUndefined();
  });
});
