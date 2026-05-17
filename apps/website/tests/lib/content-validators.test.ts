import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import {
  collectSlugsByCollection,
  collectCanonicalVariants,
  validateContent,
} from "../../src/lib/content-validators.ts";

describe("collectSlugsByCollection", () => {
  test("returns empty arrays when store has no content", async () => {
    const store = new InMemoryStore();
    const result = await collectSlugsByCollection(store);
    expect(result.ingredients).toEqual([]);
    expect(result.mixtures).toEqual([]);
    expect(result.recipes).toEqual([]);
  });

  test("extracts slugs from locale-prefixed ingredient ids", async () => {
    const store = new InMemoryStore();
    await store.put("ingredients", "en/cardamom", { name: "Cardamom", category: "spice" });
    await store.put("ingredients", "de/kardamom", { name: "Kardamom", category: "spice" });
    const result = await collectSlugsByCollection(store);
    expect(result.ingredients).toContain("cardamom");
    expect(result.ingredients).toContain("kardamom");
  });

  test("extracts slugs from locale-prefixed mixture ids", async () => {
    const store = new InMemoryStore();
    await store.put("mixtures", "en/harissa", { name: "Harissa" });
    const result = await collectSlugsByCollection(store);
    expect(result.mixtures).toContain("harissa");
  });

  test("extracts slugs from locale-prefixed recipe ids", async () => {
    const store = new InMemoryStore();
    await store.put("recipes", "en/miso-ramen", { name: "Miso Ramen" });
    const result = await collectSlugsByCollection(store);
    expect(result.recipes).toContain("miso-ramen");
  });

  test("deduplicates slugs that appear in multiple locales of the same collection", async () => {
    const store = new InMemoryStore();
    await store.put("ingredients", "en/cardamom", { name: "Cardamom", category: "spice" });
    await store.put("ingredients", "de/cardamom", { name: "Kardamom", category: "spice" });
    const result = await collectSlugsByCollection(store);
    expect(result.ingredients.filter((s) => s === "cardamom")).toHaveLength(1);
  });
});

describe("collectCanonicalVariants", () => {
  test("returns empty object when store has no meta", async () => {
    const store = new InMemoryStore();
    const result = await collectCanonicalVariants(store);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("includes canonical entity with non-empty variants", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/en/harissa-moroccan", {
      canonicalLocale: "en",
      variants: ["harissa-lebanese"],
    });
    const result = await collectCanonicalVariants(store);
    expect(result["harissa-moroccan"]).toEqual(["harissa-lebanese"]);
  });

  test("includes canonical entity with empty variants", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/en/berbere", {
      canonicalLocale: "en",
      variants: [],
    });
    const result = await collectCanonicalVariants(store);
    expect(result["berbere"]).toEqual([]);
  });

  test("excludes non-canonical locale meta (translationOf set)", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/de/harissa-moroccan", {
      canonicalLocale: "en",
      translationOf: "harissa-moroccan",
      variants: ["harissa-lebanese"],
    });
    const result = await collectCanonicalVariants(store);
    // de locale with canonicalLocale: "en" → not canonical
    expect(Object.keys(result)).not.toContain("harissa-moroccan");
  });

  test("includes entity when locale matches canonicalLocale", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "recipes/en/miso-ramen", {
      canonicalLocale: "en",
      variants: [],
    });
    const result = await collectCanonicalVariants(store);
    expect("miso-ramen" in result).toBe(true);
  });

  test("ignores meta without canonicalLocale (treated as non-canonical)", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/en/old-entity", {
      variants: ["other"],
    });
    const result = await collectCanonicalVariants(store);
    expect(Object.keys(result)).not.toContain("old-entity");
  });
});

describe("validateContent", () => {
  test("returns no violations for clean content", async () => {
    const store = new InMemoryStore();
    await store.put("ingredients", "en/cardamom", { name: "Cardamom", category: "spice" });
    await store.put("mixtures", "en/harissa", { name: "Harissa" });
    await store.put("meta", "mixtures/en/harissa", {
      canonicalLocale: "en",
      variants: [],
    });
    const result = await validateContent(store);
    expect(result.slugConflicts).toEqual([]);
    expect(result.variantsViolations).toEqual([]);
  });

  test("reports slug conflict when same slug in ingredients and mixtures", async () => {
    const store = new InMemoryStore();
    await store.put("ingredients", "en/harissa", { name: "Harissa", category: "other" });
    await store.put("mixtures", "en/harissa", { name: "Harissa Sauce" });
    const result = await validateContent(store);
    expect(result.slugConflicts).toHaveLength(1);
    expect(result.slugConflicts[0]?.slug).toBe("harissa");
  });

  test("reports variants violation when back-link is missing", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/en/harissa-moroccan", {
      canonicalLocale: "en",
      variants: ["harissa-lebanese"],
    });
    await store.put("meta", "mixtures/en/harissa-lebanese", {
      canonicalLocale: "en",
      variants: [],
    });
    const result = await validateContent(store);
    expect(result.variantsViolations).toHaveLength(1);
    expect(result.variantsViolations[0]?.reason).toBe("missing-back-link");
  });

  test("reports no violations for symmetric variants group", async () => {
    const store = new InMemoryStore();
    await store.put("meta", "mixtures/en/harissa-moroccan", {
      canonicalLocale: "en",
      variants: ["harissa-lebanese"],
    });
    await store.put("meta", "mixtures/en/harissa-lebanese", {
      canonicalLocale: "en",
      variants: ["harissa-moroccan"],
    });
    const result = await validateContent(store);
    expect(result.slugConflicts).toEqual([]);
    expect(result.variantsViolations).toEqual([]);
  });
});

describe("actual content validation", () => {
  test("current content has no cross-collection slug conflicts", async () => {
    const { LocalFsStore } = await import("../../src/lib/stores/local-fs.ts");
    const store = new LocalFsStore();
    const { slugConflicts } = await validateContent(store);
    expect(slugConflicts).toEqual([]);
  });

  test("current content has no variants closure violations", async () => {
    const { LocalFsStore } = await import("../../src/lib/stores/local-fs.ts");
    const store = new LocalFsStore();
    const { variantsViolations } = await validateContent(store);
    expect(variantsViolations).toEqual([]);
  });
});
