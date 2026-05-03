import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar, INGREDIENT_META } from "../../src/lib/meta-sidecar.ts";
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
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
    });
    const stored = await store.get("ingredients", "en/cardamom");
    expect(stored?.data).toEqual({ name: "Cardamom", category: "spice" });
  });

  test("does not write meta sidecar when meta is omitted", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
    });
    expect(await store.get(INGREDIENT_META, "en/cardamom")).toBeNull();
  });

  test("writes meta sidecar when meta is provided", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect((meta?.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("save as draft persists draft=true on first save", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect((meta?.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("save as draft preserves unrelated meta fields (merge-patch)", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", {
      imageAttribution: { source: "Openverse" },
      translations: { de: "kardamom" },
    });
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual(
      expect.objectContaining({
        imageAttribution: { source: "Openverse" },
        translations: { de: "kardamom" },
        draft: true,
        canonicalLocale: "en",
      }),
    );
  });

  test("toggling from draft to published updates only draft flag", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: true, translations: { de: "kardamom" } },
    });
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: false },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual(
      expect.objectContaining({
        draft: false,
        translations: { de: "kardamom" },
        canonicalLocale: "en",
      }),
    );
  });
});

describe("saveIngredient — canonicalLocale", () => {
  test("stamps canonicalLocale from locale on first save", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "de",
      slug: "kardamom",
      ingredient: { name: "Kardamom", category: "spice" },
      meta: { draft: true },
    });
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("does not overwrite canonicalLocale on subsequent saves", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "de",
      slug: "kardamom",
      ingredient: { name: "Kardamom", category: "spice" },
      meta: { draft: true },
    });
    await saveIngredient(store, sidecar, {
      locale: "de",
      slug: "kardamom",
      ingredient: { name: "Kardamom updated", category: "spice" },
      meta: { draft: false },
    });
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("does not write meta sidecar when meta is omitted", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
    });
    expect(await store.get(INGREDIENT_META, "en/cardamom")).toBeNull();
  });
});

describe("quickCreateIngredient", () => {
  test("creates a stub with empty arrays", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await quickCreateIngredient(store, sidecar, {
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
    const sidecar = createMetaSidecar(store);
    await quickCreateIngredient(store, sidecar, {
      locale: "de",
      slug: "kardamom",
      name: "Kardamom",
      category: "spice",
    });
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("stamps canonicalLocale from locale", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await quickCreateIngredient(store, sidecar, {
      locale: "de",
      slug: "kardamom",
      name: "Kardamom",
      category: "spice",
    });
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });
});

describe("deleteIngredient", () => {
  test("removes the ingredient and its meta sidecar", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("ingredients", "en/cardamom", { name: "Cardamom" });
    await store.put(INGREDIENT_META, "en/cardamom", { draft: true });
    await deleteIngredient(store, sidecar, { id: "en/cardamom" });
    expect(await store.get("ingredients", "en/cardamom")).toBeNull();
    expect(await store.get(INGREDIENT_META, "en/cardamom")).toBeNull();
  });
});

describe("saveIngredientMeta", () => {
  test("merge-patches existing meta", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", {
      translations: { de: "kardamom" },
    });
    await saveIngredientMeta(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      patch: { imageAttribution: { source: "Openverse" } },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({
      translations: { de: "kardamom" },
      imageAttribution: { source: "Openverse" },
    });
  });
});

describe("publishIngredient / unpublishIngredient", () => {
  test("unpublishIngredient sets draft=true, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", {
      draft: false,
      translations: { de: "kardamom" },
    });
    await unpublishIngredient(store, sidecar, { locale: "en", slug: "cardamom" });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({ draft: true, translations: { de: "kardamom" } });
  });

  test("publishIngredient sets draft=false, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", {
      draft: true,
      translations: { de: "kardamom" },
    });
    await publishIngredient(store, sidecar, { locale: "en", slug: "cardamom" });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({ draft: false, translations: { de: "kardamom" } });
  });

  test("unpublishIngredient creates the meta sidecar if missing", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await unpublishIngredient(store, sidecar, { locale: "en", slug: "cardamom" });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({ draft: true });
  });
});

describe("saveIngredient — translation-sync wiring", () => {
  test("canonical save stamps canonicalContentHash into meta", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: false },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(typeof (meta?.data as Record<string, unknown>)["canonicalContentHash"]).toBe("string");
  });

  test("canonical save flags translation children stale when content changes", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    // First save — establishes initial hash
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom", category: "spice" },
      meta: { draft: false },
    });
    // Translation child
    await store.put(INGREDIENT_META, "de/cardamom", { translationOf: "en/cardamom" });

    // Second save — content changes
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom updated", category: "spice" },
      meta: { draft: false },
    });

    const deMeta = await store.get(INGREDIENT_META, "de/cardamom");
    expect(typeof (deMeta?.data as Record<string, unknown>)["translationStaleSince"]).toBe(
      "string",
    );
  });

  test("canonical save with unchanged content does not re-flag translations", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const ingredient = { name: "Cardamom", category: "spice" };
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient,
      meta: { draft: false },
    });
    // Translation child — already clean
    await store.put(INGREDIENT_META, "de/cardamom", { translationOf: "en/cardamom" });

    // Save again with identical content
    await saveIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      ingredient,
      meta: { draft: false },
    });

    const deMeta = await store.get(INGREDIENT_META, "de/cardamom");
    expect((deMeta?.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("translation-side save does not flag canonical", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", { canonicalLocale: "en" });

    // Save the translation (has translationOf)
    await saveIngredient(store, sidecar, {
      locale: "de",
      slug: "kardamom",
      ingredient: { name: "Kardamom", category: "spice" },
      meta: { translationOf: "en/cardamom", draft: false },
    });

    const canonical = await store.get(INGREDIENT_META, "en/cardamom");
    expect((canonical?.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });
});
