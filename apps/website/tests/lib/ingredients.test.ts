import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar, INGREDIENT_META } from "../../src/lib/meta-sidecar.ts";
import {
  quickCreateIngredient,
  saveIngredientMeta,
  deleteIngredient,
  publishIngredient,
  unpublishIngredient,
} from "../../src/lib/ingredients.ts";

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
    expect((meta!.data as Record<string, unknown>)["draft"]).toBe(true);
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
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
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
    await saveIngredientMeta(sidecar, {
      locale: "en",
      slug: "cardamom",
      patch: { canonicalLocale: "en" },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({
      translations: { de: "kardamom" },
      canonicalLocale: "en",
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
    await unpublishIngredient(sidecar, { locale: "en", slug: "cardamom" });
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
    await publishIngredient(sidecar, { locale: "en", slug: "cardamom" });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({ draft: false, translations: { de: "kardamom" } });
  });

  test("unpublishIngredient creates the meta sidecar if missing", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await unpublishIngredient(sidecar, { locale: "en", slug: "cardamom" });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({ draft: true });
  });
});

describe("ingredientMeta — no kind field", () => {
  test("quickCreateIngredient does not write kind to meta", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await quickCreateIngredient(store, sidecar, {
      locale: "en",
      slug: "cardamom",
      name: "Cardamom",
      category: "spice",
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect((meta!.data as Record<string, unknown>)["kind"]).toBeUndefined();
  });

  test("translation meta write omits kind field", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const translationMeta = { translationOf: "en/cardamom", translations: {} };
    await sidecar.write(
      { collection: "ingredients", locale: "de", slug: "kardamom" },
      translationMeta,
    );
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta!.data as Record<string, unknown>)["kind"]).toBeUndefined();
  });
});
