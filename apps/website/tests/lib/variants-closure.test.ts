import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../../src/lib/meta-sidecar.ts";
import { applyVariantsClosure } from "../../src/lib/variants-closure.ts";

type MetaData = Record<string, unknown>;

async function readMeta(store: InMemoryStore, collection: string, locale: string, slug: string) {
  return store.get("meta", `${collection}/${locale}/${slug}`);
}

async function readVariants(
  store: InMemoryStore,
  collection: string,
  locale: string,
  slug: string,
): Promise<string[]> {
  const item = await readMeta(store, collection, locale, slug);
  return ((item?.data as MetaData)?.["variants"] as string[] | undefined) ?? [];
}

describe("applyVariantsClosure — simple link", () => {
  test("linking X to Y: Y gains X in its variants list", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", { variants: [], canonicalLocale: "en" });

    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);

    expect(result).toEqual(["recipe-y"]);
    expect(await readVariants(store, "recipes", "en", "recipe-y")).toEqual(["recipe-x"]);
  });

  test("linking X to Y and Z: both gain X; result includes both", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", { variants: [], canonicalLocale: "en" });
    await store.put("meta", "recipes/en/recipe-z", { variants: [], canonicalLocale: "en" });

    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", [
      "recipe-y",
      "recipe-z",
    ]);

    expect(result.sort()).toEqual(["recipe-y", "recipe-z"]);
    expect((await readVariants(store, "recipes", "en", "recipe-y")).sort()).toEqual([
      "recipe-x",
      "recipe-z",
    ]);
    expect((await readVariants(store, "recipes", "en", "recipe-z")).sort()).toEqual([
      "recipe-x",
      "recipe-y",
    ]);
  });
});

describe("applyVariantsClosure — transitive closure", () => {
  test("X→Y where Y already lists Z: closure expands to {X,Y,Z}", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", {
      variants: ["recipe-z"],
      canonicalLocale: "en",
    });
    await store.put("meta", "recipes/en/recipe-z", {
      variants: ["recipe-y"],
      canonicalLocale: "en",
    });

    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);

    expect(result.sort()).toEqual(["recipe-y", "recipe-z"]);
    expect((await readVariants(store, "recipes", "en", "recipe-y")).sort()).toEqual([
      "recipe-x",
      "recipe-z",
    ]);
    expect((await readVariants(store, "recipes", "en", "recipe-z")).sort()).toEqual([
      "recipe-x",
      "recipe-y",
    ]);
  });

  test("deep chain X→Y, Y→Z, Z→W: full closure {X,Y,Z,W}", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", {
      variants: ["recipe-z"],
      canonicalLocale: "en",
    });
    await store.put("meta", "recipes/en/recipe-z", {
      variants: ["recipe-y", "recipe-w"],
      canonicalLocale: "en",
    });
    await store.put("meta", "recipes/en/recipe-w", {
      variants: ["recipe-z"],
      canonicalLocale: "en",
    });

    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);

    expect(result.sort()).toEqual(["recipe-w", "recipe-y", "recipe-z"]);
    expect((await readVariants(store, "recipes", "en", "recipe-y")).sort()).toEqual([
      "recipe-w",
      "recipe-x",
      "recipe-z",
    ]);
    expect((await readVariants(store, "recipes", "en", "recipe-z")).sort()).toEqual([
      "recipe-w",
      "recipe-x",
      "recipe-y",
    ]);
    expect((await readVariants(store, "recipes", "en", "recipe-w")).sort()).toEqual([
      "recipe-x",
      "recipe-y",
      "recipe-z",
    ]);
  });

  test("idempotent: saving the same variants twice does not duplicate entries", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", { variants: [], canonicalLocale: "en" });

    await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);
    // Simulate second save: X now has [recipe-y] stored, we save again with same list
    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);

    expect(result).toEqual(["recipe-y"]);
    const yVariants = await readVariants(store, "recipes", "en", "recipe-y");
    expect(yVariants).toEqual(["recipe-x"]);
  });
});

describe("applyVariantsClosure — unlink (empty variants)", () => {
  test("empty variants removes entity from all others' lists", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", {
      variants: ["recipe-x", "recipe-z"],
      canonicalLocale: "en",
    });
    await store.put("meta", "recipes/en/recipe-z", {
      variants: ["recipe-x", "recipe-y"],
      canonicalLocale: "en",
    });

    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", []);

    expect(result).toEqual([]);
    expect(await readVariants(store, "recipes", "en", "recipe-y")).toEqual(["recipe-z"]);
    expect(await readVariants(store, "recipes", "en", "recipe-z")).toEqual(["recipe-y"]);
  });

  test("empty variants when entity not in any group: no-op for others", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", {
      variants: ["recipe-z"],
      canonicalLocale: "en",
    });

    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", []);

    expect(result).toEqual([]);
    expect(await readVariants(store, "recipes", "en", "recipe-y")).toEqual(["recipe-z"]);
  });

  test("unlinking preserves remaining group members' links to each other", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", {
      variants: ["recipe-x", "recipe-z"],
      canonicalLocale: "en",
    });
    await store.put("meta", "recipes/en/recipe-z", {
      variants: ["recipe-x", "recipe-y"],
      canonicalLocale: "en",
    });

    await applyVariantsClosure(sidecar, "recipes", "recipe-x", []);

    // Y and Z should still reference each other
    expect(await readVariants(store, "recipes", "en", "recipe-y")).toContain("recipe-z");
    expect(await readVariants(store, "recipes", "en", "recipe-z")).toContain("recipe-y");
  });
});

describe("applyVariantsClosure — translation safety", () => {
  test("translation metas are never modified", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", { variants: [], canonicalLocale: "en" });
    // Y also has a German translation — should not be touched
    await store.put("meta", "recipes/de/recipe-y-de", {
      variants: [],
      translationOf: "recipe-y",
      canonicalLocale: "en",
    });

    await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);

    const trans = await readMeta(store, "recipes", "de", "recipe-y-de");
    expect((trans!.data as MetaData)["variants"]).toEqual([]);
    expect((trans!.data as MetaData)["translationOf"]).toBe("recipe-y");
  });

  test("canonical meta is updated even when a translation exists alongside it", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/en/recipe-y", { variants: [], canonicalLocale: "en" });
    await store.put("meta", "recipes/de/recipe-y-de", {
      variants: [],
      translationOf: "recipe-y",
    });

    await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);

    expect(await readVariants(store, "recipes", "en", "recipe-y")).toEqual(["recipe-x"]);
  });
});

describe("applyVariantsClosure — mixtures collection", () => {
  test("works for mixtures collection identically to recipes", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "mixtures/en/harissa-lebanese", {
      variants: [],
      canonicalLocale: "en",
    });

    const result = await applyVariantsClosure(sidecar, "mixtures", "harissa-moroccan", [
      "harissa-lebanese",
    ]);

    expect(result).toEqual(["harissa-lebanese"]);
    expect(await readVariants(store, "mixtures", "en", "harissa-lebanese")).toEqual([
      "harissa-moroccan",
    ]);
  });
});

describe("applyVariantsClosure — missing variants member", () => {
  test("slug in newVariants with no canonical meta is silently skipped", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);

    // recipe-y has no meta in the store at all
    const result = await applyVariantsClosure(sidecar, "recipes", "recipe-x", ["recipe-y"]);

    // The missing slug is excluded from the closure result
    expect(result).toEqual([]);
  });
});
