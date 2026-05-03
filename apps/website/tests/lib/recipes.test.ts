import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { saveRecipe, deleteRecipe, publishRecipe, unpublishRecipe } from "../../src/lib/recipes.ts";

describe("saveRecipe", () => {
  test("persists a new recipe to its collection", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
    });
    const stored = await store.get("recipes", "miso-ramen");
    expect(stored?.data).toEqual({ name: "Miso Ramen" });
  });

  test("writes the meta sidecar when meta is provided", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "sauces",
      slug: "harissa",
      recipe: { name: "Harissa" },
      meta: { tags: ["spicy"] },
    });
    const meta = await store.get("meta", "sauces/harissa");
    expect(meta?.data).toEqual({ tags: ["spicy"] });
  });

  test("does not touch meta sidecar when meta is undefined", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "recipes/miso-ramen", { tags: ["existing"] });
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen v2" },
    });
    const meta = await store.get("meta", "recipes/miso-ramen");
    expect(meta?.data).toEqual({ tags: ["existing"] });
  });

  test("overwrites an existing recipe", async () => {
    const store = new InMemoryStore();
    await store.put("recipes", "miso-ramen", { name: "Old Name", description: "old" });
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "New Name" },
    });
    const stored = await store.get("recipes", "miso-ramen");
    expect(stored?.data).toEqual({ name: "New Name" });
  });
});

describe("saveRecipe — canonicalLocale", () => {
  test("stamps canonicalLocale from meta.locale on first save", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { locale: "de", draft: true },
    });
    const meta = await store.get("meta", "recipes/miso-ramen");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("does not overwrite canonicalLocale on subsequent saves", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { locale: "de", draft: true },
    });
    // Second save — locale changes to "en", but canonicalLocale must stay "de"
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { locale: "en", draft: false },
    });
    const meta = await store.get("meta", "recipes/miso-ramen");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("does not stamp canonicalLocale when meta.locale is absent", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { draft: true },
    });
    const meta = await store.get("meta", "recipes/miso-ramen");
    expect((meta?.data as Record<string, unknown>)["canonicalLocale"]).toBeUndefined();
  });
});

describe("deleteRecipe", () => {
  test("removes both the recipe and its meta sidecar", async () => {
    const store = new InMemoryStore();
    await store.put("recipes", "miso-ramen", { name: "Miso Ramen" });
    await store.put("meta", "recipes/miso-ramen", { tags: ["soup"] });

    await deleteRecipe(store, { collection: "recipes", id: "miso-ramen" });

    expect(await store.get("recipes", "miso-ramen")).toBeNull();
    expect(await store.get("meta", "recipes/miso-ramen")).toBeNull();
  });

  test("is idempotent for nonexistent items", async () => {
    const store = new InMemoryStore();
    await expect(
      deleteRecipe(store, { collection: "sauces", id: "ghost" }),
    ).resolves.toBeUndefined();
  });
});

describe("publishRecipe", () => {
  test("sets meta.draft to false, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "recipes/miso-ramen", { draft: true, tags: ["soup"] });

    await publishRecipe(store, { collection: "recipes", id: "miso-ramen" });

    const meta = await store.get("meta", "recipes/miso-ramen");
    expect(meta?.data).toEqual({ draft: false, tags: ["soup"] });
  });

  test("creates the meta sidecar if it does not exist", async () => {
    const store = new InMemoryStore();

    await publishRecipe(store, { collection: "recipes", id: "miso-ramen" });

    const meta = await store.get("meta", "recipes/miso-ramen");
    expect(meta?.data).toEqual({ draft: false });
  });
});

describe("unpublishRecipe", () => {
  test("sets meta.draft to true, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "recipes/miso-ramen", { draft: false, tags: ["soup"] });

    await unpublishRecipe(store, { collection: "recipes", id: "miso-ramen" });

    const meta = await store.get("meta", "recipes/miso-ramen");
    expect(meta?.data).toEqual({ draft: true, tags: ["soup"] });
  });
});

describe("save as draft (parameterized over recipe-shaped collections)", () => {
  for (const collection of ["recipes", "spicemixes", "sauces"] as const) {
    test(`${collection}: saveRecipe with meta.draft=true persists draft state`, async () => {
      const store = new InMemoryStore();
      await saveRecipe(store, {
        collection,
        slug: "demo",
        recipe: { name: "Demo" },
        meta: { draft: true, tags: ["wip"] },
      });
      const meta = await store.get("meta", `${collection}/demo`);
      expect(meta?.data).toEqual({ draft: true, tags: ["wip"] });
    });

    test(`${collection}: unpublishRecipe flips an existing published item to draft`, async () => {
      const store = new InMemoryStore();
      await saveRecipe(store, {
        collection,
        slug: "demo",
        recipe: { name: "Demo" },
        meta: { draft: false, tags: ["wip"] },
      });
      await unpublishRecipe(store, { collection, id: "demo" });
      const meta = await store.get("meta", `${collection}/demo`);
      expect(meta?.data).toEqual({ draft: true, tags: ["wip"] });
    });
  }
});
