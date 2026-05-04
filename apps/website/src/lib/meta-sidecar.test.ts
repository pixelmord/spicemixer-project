import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "./stores/in-memory.ts";
import { createMetaSidecar, INGREDIENT_META, PAIRING_META } from "./meta-sidecar.ts";

describe("MetaSidecar.resolve", () => {
  const store = new InMemoryStore();
  const sidecar = createMetaSidecar(store);

  test("ingredient (with locale) → ingredientMeta, locale/slug", () => {
    const result = sidecar.resolve({ collection: "ingredients", locale: "en", slug: "cardamom" });
    expect(result).toEqual({ metaCollection: INGREDIENT_META, key: "en/cardamom" });
  });

  test("mixture (with locale) → meta, mixtures/locale/slug", () => {
    const result = sidecar.resolve({ collection: "mixtures", locale: "en", slug: "harissa" });
    expect(result).toEqual({ metaCollection: "meta", key: "mixtures/en/harissa" });
  });

  test("recipe (with locale) → meta, recipes/locale/slug", () => {
    const result = sidecar.resolve({ collection: "recipes", locale: "en", slug: "miso-ramen" });
    expect(result).toEqual({ metaCollection: "meta", key: "recipes/en/miso-ramen" });
  });

  test("pairing (compound slug) → pairingMeta, compound-slug", () => {
    const result = sidecar.resolve({ collection: "pairings", slug: "cardamom--cumin" });
    expect(result).toEqual({ metaCollection: PAIRING_META, key: "cardamom--cumin" });
  });

  test("ingredient without locale throws", () => {
    expect(() => sidecar.resolve({ collection: "ingredients", slug: "cardamom" })).toThrow(
      /locale required/,
    );
  });

  test("mixture without locale throws", () => {
    expect(() => sidecar.resolve({ collection: "mixtures", slug: "harissa" })).toThrow(
      /locale required/,
    );
  });

  test("recipe without locale throws", () => {
    expect(() => sidecar.resolve({ collection: "recipes", slug: "miso-ramen" })).toThrow(
      /locale required/,
    );
  });
});

describe("MetaSidecar.read/write/exists/remove", () => {
  test("write then read returns the data for ingredient", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const ref = { collection: "ingredients" as const, locale: "en", slug: "cardamom" };
    await sidecar.write(ref, { draft: true });
    const item = await sidecar.read(ref);
    expect(item?.data).toEqual({ draft: true });
  });

  test("write then read returns the data for recipe", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const ref = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };
    await sidecar.write(ref, { draft: true });
    const item = await sidecar.read(ref);
    expect(item?.data).toEqual({ draft: true });
  });

  test("exists returns false for missing item", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    expect(await sidecar.exists({ collection: "mixtures", locale: "en", slug: "ghost" })).toBe(
      false,
    );
  });

  test("exists returns true after write", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const ref = { collection: "mixtures" as const, locale: "en", slug: "harissa" };
    await sidecar.write(ref, {});
    expect(await sidecar.exists(ref)).toBe(true);
  });

  test("remove deletes the meta entry", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const ref = { collection: "pairings" as const, slug: "cardamom--cumin" };
    await sidecar.write(ref, { imageAttribution: null });
    await sidecar.remove(ref);
    expect(await sidecar.read(ref)).toBeNull();
  });
});

describe("MetaSidecar.listSync", () => {
  test("returns ingredientMeta items for 'ingredients'", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", { draft: false });
    await store.put(INGREDIENT_META, "de/kardamom", { draft: true });
    const items = await sidecar.listSync("ingredients");
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.metaCollection === INGREDIENT_META)).toBe(true);
  });

  test("returns only meta items matching the collection prefix for 'recipes'", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/miso-ramen", { draft: false });
    await store.put("meta", "mixtures/en/harissa", { draft: true });
    const items = await sidecar.listSync("recipes");
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("recipes/en/miso-ramen");
    expect(items[0]?.metaCollection).toBe("meta");
  });

  test("returns only mixtures meta items for 'mixtures'", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "mixtures/en/harissa", { kind: "sauce" });
    await store.put("meta", "recipes/en/miso-ramen", { draft: false });
    const items = await sidecar.listSync("mixtures");
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("mixtures/en/harissa");
  });
});

describe("MetaSidecar.updateById", () => {
  test("writes by already-resolved metaCollection+id", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", { draft: true });
    await sidecar.updateById(INGREDIENT_META, "en/cardamom", { draft: false });
    const item = await store.get(INGREDIENT_META, "en/cardamom");
    expect((item?.data as Record<string, unknown>)["draft"]).toBe(false);
  });
});
