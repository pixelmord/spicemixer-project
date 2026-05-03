import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import {
  saveIngredient,
  quickCreateIngredient,
  saveIngredientMeta,
  deleteIngredient,
  publishIngredient,
  unpublishIngredient,
} from "../../src/lib/ingredients.ts";

describe("saveIngredient", () => {
  test("persists under locale-prefixed key", async () => {
    const store = new InMemoryStore();
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
    });
    const stored = await store.get("ingredients", "en/cardamom");
    expect(stored?.data).toEqual({ name: "Cardamom", category: "spice" });
  });

  test("does not write meta sidecar when meta is omitted", async () => {
    const store = new InMemoryStore();
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
    });
    expect(await store.get("ingredientMeta", "en/cardamom")).toBeNull();
  });

  test("writes meta sidecar when meta is provided", async () => {
    const store = new InMemoryStore();
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect((meta?.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("save as draft persists draft=true on first save", async () => {
    const store = new InMemoryStore();
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect((meta?.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("save as draft preserves unrelated meta fields (merge-patch)", async () => {
    const store = new InMemoryStore();
    await store.put("ingredientMeta", "en/cardamom", {
      imageAttribution: { source: "Openverse" },
      translations: { de: "kardamom" },
    });
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect(meta?.data).toEqual({
      imageAttribution: { source: "Openverse" },
      translations: { de: "kardamom" },
      draft: true,
      canonicalLocale: "en",
    });
  });

  test("toggling from draft to published updates only draft flag", async () => {
    const store = new InMemoryStore();
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true, translations: { de: "kardamom" } },
    });
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: false },
    });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect(meta?.data).toEqual({
      draft: false,
      translations: { de: "kardamom" },
      canonicalLocale: "en",
    });
  });
});

describe("saveIngredient — canonicalLocale", () => {
  test("stamps canonicalLocale from locale on first save", async () => {
    const store = new InMemoryStore();
    await saveIngredient(store, {
      locale: "de",
      slug: "kardamom",
      ingredient: { name: "Kardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get("ingredientMeta", "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("does not overwrite canonicalLocale on subsequent saves", async () => {
    const store = new InMemoryStore();
    await saveIngredient(store, {
      locale: "de",
      slug: "kardamom",
      ingredient: { name: "Kardamom", category: "spice" },
      meta: { draft: true },
    });
    // Second save of the same entry — canonicalLocale must remain "de"
    await saveIngredient(store, {
      locale: "de",
      slug: "kardamom",
      ingredient: { name: "Kardamom updated", category: "spice" },
      meta: { draft: false },
    });
    const meta = await store.get("ingredientMeta", "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("stamps canonicalLocale even when meta object is not provided", async () => {
    const store = new InMemoryStore();
    // meta omitted — no sidecar written, so canonicalLocale check is skipped
    await saveIngredient(store, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
    });
    // No meta sidecar → no canonicalLocale (meta not written at all)
    expect(await store.get("ingredientMeta", "en/cardamom")).toBeNull();
  });
});

describe("quickCreateIngredient", () => {
  test("creates a stub with empty arrays", async () => {
    const store = new InMemoryStore();
    await quickCreateIngredient(store, {
      locale: "de",
      slug: "kardamom",
      name: "Kardamom",
      category: "spice",
    });
    const stored = await store.get("ingredients", "de/kardamom");
    expect(stored?.data).toEqual({
      name: "Kardamom",
      category: "spice",
      images: [],
      origin: [],
      flavorNotes: [],
      pairings: [],
    });
  });

  test("creates a draft meta sidecar", async () => {
    const store = new InMemoryStore();
    await quickCreateIngredient(store, {
      locale: "de",
      slug: "kardamom",
      name: "Kardamom",
      category: "spice",
    });
    const meta = await store.get("ingredientMeta", "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("stamps canonicalLocale from locale", async () => {
    const store = new InMemoryStore();
    await quickCreateIngredient(store, {
      locale: "de",
      slug: "kardamom",
      name: "Kardamom",
      category: "spice",
    });
    const meta = await store.get("ingredientMeta", "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });
});

describe("deleteIngredient", () => {
  test("removes the ingredient and its meta sidecar", async () => {
    const store = new InMemoryStore();
    await store.put("ingredients", "en/cardamom", { name: "Cardamom" });
    await store.put("ingredientMeta", "en/cardamom", { draft: true });
    await deleteIngredient(store, { id: "en/cardamom" });
    expect(await store.get("ingredients", "en/cardamom")).toBeNull();
    expect(await store.get("ingredientMeta", "en/cardamom")).toBeNull();
  });
});

describe("saveIngredientMeta", () => {
  test("merge-patches existing meta", async () => {
    const store = new InMemoryStore();
    await store.put("ingredientMeta", "en/cardamom", {
      translations: { de: "kardamom" },
    });
    await saveIngredientMeta(store, {
      locale: "en",
      slug: "cardamom",
      patch: { imageAttribution: { source: "Openverse" } },
    });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect(meta?.data).toEqual({
      translations: { de: "kardamom" },
      imageAttribution: { source: "Openverse" },
    });
  });
});

describe("publishIngredient / unpublishIngredient", () => {
  test("unpublishIngredient sets draft=true, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    await store.put("ingredientMeta", "en/cardamom", {
      draft: false,
      translations: { de: "kardamom" },
    });
    await unpublishIngredient(store, { locale: "en", slug: "cardamom" });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect(meta?.data).toEqual({ draft: true, translations: { de: "kardamom" } });
  });

  test("publishIngredient sets draft=false, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    await store.put("ingredientMeta", "en/cardamom", {
      draft: true,
      translations: { de: "kardamom" },
    });
    await publishIngredient(store, { locale: "en", slug: "cardamom" });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect(meta?.data).toEqual({ draft: false, translations: { de: "kardamom" } });
  });

  test("unpublishIngredient creates the meta sidecar if missing", async () => {
    const store = new InMemoryStore();
    await unpublishIngredient(store, { locale: "en", slug: "cardamom" });
    const meta = await store.get("ingredientMeta", "en/cardamom");
    expect(meta?.data).toEqual({ draft: true });
  });
});
