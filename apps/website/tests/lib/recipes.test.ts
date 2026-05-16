import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../../src/lib/meta-sidecar.ts";
import { deleteRecipe, publishRecipe, unpublishRecipe } from "../../src/lib/recipes.ts";
import { saveEntity } from "../../src/lib/save-entity.ts";

describe("deleteRecipe", () => {
  test("removes both the recipe and its meta sidecar", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("recipes", "en/miso-ramen", { name: "Miso Ramen" });
    await store.put("meta", "recipes/en/miso-ramen", { tags: ["soup"] });

    await deleteRecipe(store, sidecar, { collection: "recipes", locale: "en", slug: "miso-ramen" });

    expect(await store.get("recipes", "en/miso-ramen")).toBeNull();
    expect(await store.get("meta", "recipes/en/miso-ramen")).toBeNull();
  });

  test("is idempotent for nonexistent items", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await expect(
      deleteRecipe(store, sidecar, { collection: "mixtures", locale: "en", slug: "ghost" }),
    ).resolves.toBeUndefined();
  });
});

describe("publishRecipe", () => {
  test("sets meta.draft to false, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/miso-ramen", { draft: true, tags: ["soup"] });

    await publishRecipe(sidecar, { collection: "recipes", locale: "en", slug: "miso-ramen" });

    const meta = await store.get("meta", "recipes/en/miso-ramen");
    expect(meta?.data).toEqual({ draft: false, tags: ["soup"] });
  });

  test("creates the meta sidecar if it does not exist", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);

    await publishRecipe(sidecar, { collection: "recipes", locale: "en", slug: "miso-ramen" });

    const meta = await store.get("meta", "recipes/en/miso-ramen");
    expect(meta?.data).toEqual({ draft: false });
  });
});

describe("unpublishRecipe", () => {
  test("sets meta.draft to true, preserving other meta fields", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/miso-ramen", { draft: false, tags: ["soup"] });

    await unpublishRecipe(sidecar, { collection: "recipes", locale: "en", slug: "miso-ramen" });

    const meta = await store.get("meta", "recipes/en/miso-ramen");
    expect(meta?.data).toEqual({ draft: true, tags: ["soup"] });
  });
});

describe("save as draft (parameterized over recipe-shaped collections)", () => {
  for (const collection of ["recipes", "mixtures"] as const) {
    test(`${collection}: saveEntity with meta.draft=true persists draft state`, async () => {
      const store = new InMemoryStore();
      const sidecar = createMetaSidecar(store);
      await saveEntity(store, sidecar, {
        ref: { collection, locale: "en", slug: "demo" },
        content: { name: "Demo" },
        meta: { draft: true, tags: ["wip"] },
      });
      const meta = await store.get("meta", `${collection}/en/demo`);
      expect(meta?.data).toEqual(expect.objectContaining({ draft: true, tags: ["wip"] }));
    });

    test(`${collection}: unpublishRecipe flips an existing published item to draft`, async () => {
      const store = new InMemoryStore();
      const sidecar = createMetaSidecar(store);
      await saveEntity(store, sidecar, {
        ref: { collection, locale: "en", slug: "demo" },
        content: { name: "Demo" },
        meta: { draft: false, tags: ["wip"] },
      });
      await unpublishRecipe(sidecar, { collection, locale: "en", slug: "demo" });
      const meta = await store.get("meta", `${collection}/en/demo`);
      expect(meta?.data).toEqual(expect.objectContaining({ draft: true, tags: ["wip"] }));
    });
  }
});
