import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import {
  savePairing,
  togglePairingDraft,
  deletePairing,
  savePairingMeta,
} from "../../src/lib/pairings.ts";
import { NotFoundError } from "../../src/lib/errors.ts";

describe("savePairing", () => {
  test("canonicalizes ingredient order alphabetically", async () => {
    const store = new InMemoryStore();
    await savePairing(store, {
      id: "cardamom--anise",
      ingredients: ["cardamom", "anise"],
      description: "Warm and licorice-y.",
      locale: "en",
    });
    const stored = await store.get("pairings", "cardamom--anise");
    expect((stored!.data as Record<string, unknown>)["ingredients"]).toEqual(["anise", "cardamom"]);
  });

  test("migrates legacy single-locale description into descriptions map", async () => {
    const store = new InMemoryStore();
    await store.put("pairings", "anise--cardamom", {
      ingredients: ["anise", "cardamom"],
      description: "Warm and licorice-y.", // legacy field
      draft: false,
    });
    await savePairing(store, {
      id: "anise--cardamom",
      ingredients: ["anise", "cardamom"],
      description: "Warm und lakritzig.",
      locale: "de",
    });
    const stored = await store.get("pairings", "anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["descriptions"]).toEqual({
      en: "Warm and licorice-y.",
      de: "Warm und lakritzig.",
    });
  });

  test("merges new locale description into existing descriptions map", async () => {
    const store = new InMemoryStore();
    await store.put("pairings", "anise--cardamom", {
      ingredients: ["anise", "cardamom"],
      descriptions: { en: "Warm and licorice-y." },
      draft: false,
    });
    await savePairing(store, {
      id: "anise--cardamom",
      ingredients: ["anise", "cardamom"],
      description: "Warm und lakritzig.",
      locale: "de",
    });
    const stored = await store.get("pairings", "anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["descriptions"]).toEqual({
      en: "Warm and licorice-y.",
      de: "Warm und lakritzig.",
    });
  });

  test("preserves existing image when image is not supplied", async () => {
    const store = new InMemoryStore();
    await store.put("pairings", "anise--cardamom", {
      ingredients: ["anise", "cardamom"],
      descriptions: { en: "x" },
      image: "https://example.com/img.jpg",
    });
    await savePairing(store, {
      id: "anise--cardamom",
      ingredients: ["anise", "cardamom"],
      description: "y",
      locale: "en",
    });
    const stored = await store.get("pairings", "anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["image"]).toBe("https://example.com/img.jpg");
  });

  test("throws NotFoundError when togglePairingDraft targets missing pairing", async () => {
    const store = new InMemoryStore();
    await expect(togglePairingDraft(store, { id: "ghost", draft: true })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  test("togglePairingDraft updates draft on existing pairing", async () => {
    const store = new InMemoryStore();
    await store.put("pairings", "anise--cardamom", {
      ingredients: ["anise", "cardamom"],
      descriptions: { en: "x" },
      draft: false,
    });
    await togglePairingDraft(store, { id: "anise--cardamom", draft: true });
    const stored = await store.get("pairings", "anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("deletePairing removes both the pairing and its meta sidecar", async () => {
    const store = new InMemoryStore();
    await store.put("pairings", "anise--cardamom", { ingredients: ["anise", "cardamom"] });
    await store.put("pairingMeta", "anise--cardamom", { imageAttribution: { source: "x" } });

    await deletePairing(store, { id: "anise--cardamom" });

    expect(await store.get("pairings", "anise--cardamom")).toBeNull();
    expect(await store.get("pairingMeta", "anise--cardamom")).toBeNull();
  });

  test("savePairingMeta merge-patches existing meta", async () => {
    const store = new InMemoryStore();
    await store.put("pairingMeta", "anise--cardamom", {
      imageAttribution: { source: "Openverse" },
    });
    await savePairingMeta(store, {
      id: "anise--cardamom",
      patch: { aiSuggestions: { en: { contentHash: "abc" } } },
    });
    const meta = await store.get("pairingMeta", "anise--cardamom");
    expect(meta?.data).toEqual({
      imageAttribution: { source: "Openverse" },
      aiSuggestions: { en: { contentHash: "abc" } },
    });
  });

  test("save as draft persists draft=true on first save", async () => {
    const store = new InMemoryStore();
    await savePairing(store, {
      id: "anise--cardamom",
      ingredients: ["anise", "cardamom"],
      description: "Warm and licorice-y.",
      locale: "en",
      draft: true,
    });
    const stored = await store.get("pairings", "anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("save without draft preserves existing draft state", async () => {
    const store = new InMemoryStore();
    await store.put("pairings", "anise--cardamom", {
      ingredients: ["anise", "cardamom"],
      descriptions: { en: "x" },
      draft: true,
    });
    await savePairing(store, {
      id: "anise--cardamom",
      ingredients: ["anise", "cardamom"],
      description: "y",
      locale: "en",
    });
    const stored = await store.get("pairings", "anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("does not stamp canonicalLocale on pairingMeta (pairings excluded per ADR 0003)", async () => {
    const store = new InMemoryStore();
    await savePairing(store, {
      id: "anise--cardamom",
      ingredients: ["anise", "cardamom"],
      description: "Warm and licorice-y.",
      locale: "en",
    });
    const pairingMeta = await store.get("pairingMeta", "anise--cardamom");
    expect(pairingMeta).toBeNull();
  });

  test("clears image when empty string is supplied", async () => {
    const store = new InMemoryStore();
    await store.put("pairings", "anise--cardamom", {
      ingredients: ["anise", "cardamom"],
      descriptions: { en: "x" },
      image: "https://example.com/img.jpg",
    });
    await savePairing(store, {
      id: "anise--cardamom",
      ingredients: ["anise", "cardamom"],
      description: "y",
      locale: "en",
      image: "",
    });
    const stored = await store.get("pairings", "anise--cardamom");
    expect((stored!.data as Record<string, unknown>)["image"]).toBeUndefined();
  });
});
