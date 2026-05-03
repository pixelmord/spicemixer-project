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
