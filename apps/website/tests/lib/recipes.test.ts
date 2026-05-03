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
      collection: "mixtures",
      slug: "harissa",
      recipe: { name: "Harissa" },
      meta: { tags: ["spicy"] },
    });
    const meta = await store.get("meta", "mixtures/harissa");
    expect(meta?.data).toEqual(expect.objectContaining({ tags: ["spicy"] }));
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
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("does not overwrite canonicalLocale on subsequent saves", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { locale: "de", draft: true },
    });
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { locale: "en", draft: false },
    });
    const meta = await store.get("meta", "recipes/miso-ramen");
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
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
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBeUndefined();
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
      deleteRecipe(store, { collection: "mixtures", id: "ghost" }),
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
  for (const collection of ["recipes", "mixtures"] as const) {
    test(`${collection}: saveRecipe with meta.draft=true persists draft state`, async () => {
      const store = new InMemoryStore();
      await saveRecipe(store, {
        collection,
        slug: "demo",
        recipe: { name: "Demo" },
        meta: { draft: true, tags: ["wip"] },
      });
      const meta = await store.get("meta", `${collection}/demo`);
      expect(meta?.data).toEqual(expect.objectContaining({ draft: true, tags: ["wip"] }));
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
      expect(meta?.data).toEqual(expect.objectContaining({ draft: true, tags: ["wip"] }));
    });
  }
});

describe("saveRecipe — translation-sync wiring", () => {
  test("canonical save stamps canonicalContentHash into meta", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { locale: "en", draft: false },
    });
    const meta = await store.get("meta", "recipes/miso-ramen");
    expect(typeof (meta?.data as Record<string, unknown>)["canonicalContentHash"]).toBe("string");
  });

  test("canonical save flags translation children stale when content changes", async () => {
    const store = new InMemoryStore();
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen" },
      meta: { locale: "en", draft: false },
    });
    await store.put("meta", "recipes/miso-ramen-de", { translationOf: "miso-ramen" });

    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe: { name: "Miso Ramen updated" },
      meta: { locale: "en", draft: false },
    });

    const deMeta = await store.get("meta", "recipes/miso-ramen-de");
    expect(typeof (deMeta?.data as Record<string, unknown>)["translationStaleSince"]).toBe(
      "string",
    );
  });

  test("canonical save with unchanged content does not re-flag translations", async () => {
    const store = new InMemoryStore();
    const recipe = { name: "Miso Ramen" };
    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe,
      meta: { locale: "en", draft: false },
    });
    await store.put("meta", "recipes/miso-ramen-de", { translationOf: "miso-ramen" });

    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen",
      recipe,
      meta: { locale: "en", draft: false },
    });

    const deMeta = await store.get("meta", "recipes/miso-ramen-de");
    expect((deMeta?.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("translation-side save does not flag canonical", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "recipes/miso-ramen", { canonicalLocale: "en" });

    await saveRecipe(store, {
      collection: "recipes",
      slug: "miso-ramen-de",
      recipe: { name: "Miso Ramen DE" },
      meta: { translationOf: "miso-ramen", locale: "de", draft: false },
    });

    const canonical = await store.get("meta", "recipes/miso-ramen");
    expect((canonical?.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });
});
