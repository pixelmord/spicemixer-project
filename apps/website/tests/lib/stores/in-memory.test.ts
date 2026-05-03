import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../../src/lib/stores/in-memory.ts";

describe("InMemoryStore", () => {
  test("put + get roundtrips data", async () => {
    const store = new InMemoryStore();
    await store.put("recipes", "miso-ramen", { name: "Miso Ramen" });
    const result = await store.get("recipes", "miso-ramen");
    expect(result?.data).toEqual({ name: "Miso Ramen" });
  });

  test("get returns null for missing item", async () => {
    const store = new InMemoryStore();
    expect(await store.get("recipes", "nope")).toBeNull();
  });

  test("list filters by collection", async () => {
    const store = new InMemoryStore();
    await store.put("recipes", "a", { name: "A" });
    await store.put("mixtures", "b", { name: "B" });
    const recipes = await store.list("recipes");
    expect(recipes.map((i) => i.id)).toEqual(["a"]);
  });

  test("list filters ingredients to locale-prefixed ids only", async () => {
    const store = new InMemoryStore();
    await store.put("ingredients", "en/cardamom", { name: "Cardamom" });
    await store.put("ingredients", "stray", { name: "Stray" });
    const items = await store.list("ingredients");
    expect(items.map((i) => i.id)).toEqual(["en/cardamom"]);
  });

  test("delete removes item", async () => {
    const store = new InMemoryStore();
    await store.put("recipes", "a", { name: "A" });
    await store.delete("recipes", "a");
    expect(await store.get("recipes", "a")).toBeNull();
  });
});

describe("InMemoryStore — mixtures collection round-trip", () => {
  test("put + get roundtrips a mixture", async () => {
    const store = new InMemoryStore();
    const data = { name: "Harissa", kind: "sauce", recipeIngredient: ["chili"] };
    await store.put("mixtures", "harissa", data);
    const result = await store.get("mixtures", "harissa");
    expect(result?.data).toEqual(data);
    expect(result?.collection).toBe("mixtures");
    expect(result?.id).toBe("harissa");
  });

  test("list returns mixtures and not recipes", async () => {
    const store = new InMemoryStore();
    await store.put("mixtures", "harissa", { name: "Harissa" });
    await store.put("mixtures", "ras-el-hanout", { name: "Ras el Hanout" });
    await store.put("recipes", "miso-ramen", { name: "Miso Ramen" });
    const mixtures = await store.list("mixtures");
    expect(mixtures.map((i) => i.id).sort()).toEqual(["harissa", "ras-el-hanout"]);
  });

  test("delete removes only the targeted mixture", async () => {
    const store = new InMemoryStore();
    await store.put("mixtures", "harissa", { name: "Harissa" });
    await store.put("mixtures", "berbere", { name: "Berbere" });
    await store.delete("mixtures", "harissa");
    expect(await store.get("mixtures", "harissa")).toBeNull();
    expect(await store.get("mixtures", "berbere")).not.toBeNull();
  });

  test("meta collection stores mixture meta under mixtures/ prefix", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/harissa", { kind: "sauce", draft: false });
    const meta = await store.get("meta", "mixtures/harissa");
    expect(meta?.data).toEqual({ kind: "sauce", draft: false });
  });

  test("mixtures and recipes are isolated in the meta collection", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/harissa", { kind: "sauce" });
    await store.put("meta", "recipes/miso-ramen", { kind: "recipe" });
    const all = await store.list("meta");
    expect(all).toHaveLength(2);
    const ids = all.map((i) => i.id).sort();
    expect(ids).toEqual(["mixtures/harissa", "recipes/miso-ramen"]);
  });
});
