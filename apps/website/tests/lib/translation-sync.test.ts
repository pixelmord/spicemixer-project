import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar, INGREDIENT_META } from "../../src/lib/meta-sidecar.ts";
import {
  contentHash,
  flagTranslationsStale,
  clearStaleFlag,
} from "../../src/lib/translation-sync.ts";

// ---------------------------------------------------------------------------
// contentHash
// ---------------------------------------------------------------------------

describe("contentHash", () => {
  test("returns a 16-char hex string", () => {
    const hash = contentHash({ name: "Cardamom" });
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test("is stable across key order differences", () => {
    const a = contentHash({ name: "Cardamom", category: "spice" });
    const b = contentHash({ category: "spice", name: "Cardamom" });
    expect(a).toBe(b);
  });

  test("is stable across leading/trailing whitespace in string values", () => {
    const a = contentHash({ name: "Cardamom", summary: "A spice" });
    const b = contentHash({ name: "  Cardamom  ", summary: "  A spice  " });
    expect(a).toBe(b);
  });

  test("differs when content changes", () => {
    const a = contentHash({ name: "Cardamom" });
    const b = contentHash({ name: "Cumin" });
    expect(a).not.toBe(b);
  });

  test("is deterministic across multiple calls", () => {
    const record = { name: "Cardamom", origin: ["Guatemala", "India"] };
    expect(contentHash(record)).toBe(contentHash(record));
  });

  test("is stable across array element key order", () => {
    const a = contentHash({ items: [{ b: 2, a: 1 }] });
    const b = contentHash({ items: [{ a: 1, b: 2 }] });
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// flagTranslationsStale — ingredients
// ---------------------------------------------------------------------------

describe("flagTranslationsStale — ingredients", () => {
  test("stamps translationStaleSince on all translation children", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    // Canonical
    await store.put(INGREDIENT_META, "en/cardamom", {
      canonicalLocale: "en",
      translations: { de: "de/cardamom" },
    });
    // Two translations
    await store.put(INGREDIENT_META, "de/cardamom", {
      translationOf: "en/cardamom",
    });
    await store.put(INGREDIENT_META, "fr/cardamom", {
      translationOf: "en/cardamom",
    });

    await flagTranslationsStale(sidecar, "ingredients", "en/cardamom");

    const de = await store.get(INGREDIENT_META, "de/cardamom");
    const fr = await store.get(INGREDIENT_META, "fr/cardamom");
    expect(typeof (de!.data as Record<string, unknown>)["translationStaleSince"]).toBe("string");
    expect(typeof (fr!.data as Record<string, unknown>)["translationStaleSince"]).toBe("string");
  });

  test("does not stamp the canonical entry itself", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", {
      canonicalLocale: "en",
    });
    await store.put(INGREDIENT_META, "de/cardamom", {
      translationOf: "en/cardamom",
    });

    await flagTranslationsStale(sidecar, "ingredients", "en/cardamom");

    const canonical = await store.get(INGREDIENT_META, "en/cardamom");
    expect((canonical!.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("skips children that are already stale (preserves original timestamp)", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const existingTimestamp = "2026-01-01T00:00:00.000Z";
    await store.put(INGREDIENT_META, "de/cardamom", {
      translationOf: "en/cardamom",
      translationStaleSince: existingTimestamp,
    });

    await flagTranslationsStale(sidecar, "ingredients", "en/cardamom");

    const de = await store.get(INGREDIENT_META, "de/cardamom");
    expect((de!.data as Record<string, unknown>)["translationStaleSince"]).toBe(existingTimestamp);
  });

  test("does not touch entries with a different translationOf", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "de/cumin", {
      translationOf: "en/cumin",
    });

    await flagTranslationsStale(sidecar, "ingredients", "en/cardamom");

    const cumin = await store.get(INGREDIENT_META, "de/cumin");
    expect((cumin!.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("preserves all other meta fields when stamping", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "de/cardamom", {
      translationOf: "en/cardamom",
      draft: false,
      region: ["europe"],
    });

    await flagTranslationsStale(sidecar, "ingredients", "en/cardamom");

    const de = await store.get(INGREDIENT_META, "de/cardamom");
    const data = de!.data as Record<string, unknown>;
    expect(data["draft"]).toBe(false);
    expect(data["region"]).toEqual(["europe"]);
    expect(typeof data["translationStaleSince"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// flagTranslationsStale — recipes / mixtures
// ---------------------------------------------------------------------------

describe("flagTranslationsStale — recipes", () => {
  test("stamps translationStaleSince on translation children in the same collection", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/miso-ramen", {
      canonicalLocale: "en",
      translations: { de: "miso-ramen-de" },
    });
    await store.put("meta", "recipes/miso-ramen-de", {
      translationOf: "miso-ramen",
    });

    await flagTranslationsStale(sidecar, "recipes", "miso-ramen");

    const deMeta = await store.get("meta", "recipes/miso-ramen-de");
    expect(typeof (deMeta!.data as Record<string, unknown>)["translationStaleSince"]).toBe(
      "string",
    );
  });

  test("does not stamp canonical meta", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/miso-ramen", { canonicalLocale: "en" });
    await store.put("meta", "recipes/miso-ramen-de", { translationOf: "miso-ramen" });

    await flagTranslationsStale(sidecar, "recipes", "miso-ramen");

    const canonical = await store.get("meta", "recipes/miso-ramen");
    expect((canonical!.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("does not stamp translations in a different collection", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "mixtures/harissa-de", {
      translationOf: "harissa",
    });

    await flagTranslationsStale(sidecar, "recipes", "harissa");

    const mixtureMeta = await store.get("meta", "mixtures/harissa-de");
    expect((mixtureMeta!.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("skips already-stale children", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const existingTimestamp = "2026-01-01T00:00:00.000Z";
    await store.put("meta", "recipes/miso-ramen-de", {
      translationOf: "miso-ramen",
      translationStaleSince: existingTimestamp,
    });

    await flagTranslationsStale(sidecar, "recipes", "miso-ramen");

    const deMeta = await store.get("meta", "recipes/miso-ramen-de");
    expect((deMeta!.data as Record<string, unknown>)["translationStaleSince"]).toBe(
      existingTimestamp,
    );
  });
});

// ---------------------------------------------------------------------------
// clearStaleFlag — ingredients
// ---------------------------------------------------------------------------

describe("clearStaleFlag — ingredients", () => {
  test("clears translationStaleSince on the target entry", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "de/cardamom", {
      translationOf: "en/cardamom",
      translationStaleSince: "2026-01-01T00:00:00.000Z",
    });

    await clearStaleFlag(sidecar, "ingredients", "de/cardamom");

    const de = await store.get(INGREDIENT_META, "de/cardamom");
    expect((de!.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("preserves all other fields after clearing", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "de/cardamom", {
      translationOf: "en/cardamom",
      draft: false,
      region: ["europe"],
      translationStaleSince: "2026-01-01T00:00:00.000Z",
    });

    await clearStaleFlag(sidecar, "ingredients", "de/cardamom");

    const de = await store.get(INGREDIENT_META, "de/cardamom");
    const data = de!.data as Record<string, unknown>;
    expect(data["translationOf"]).toBe("en/cardamom");
    expect(data["draft"]).toBe(false);
    expect(data["region"]).toEqual(["europe"]);
  });

  test("does not touch other entries", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "de/cardamom", {
      translationStaleSince: "2026-01-01T00:00:00.000Z",
    });
    await store.put(INGREDIENT_META, "fr/cardamom", {
      translationStaleSince: "2026-01-01T00:00:00.000Z",
    });

    await clearStaleFlag(sidecar, "ingredients", "de/cardamom");

    const fr = await store.get(INGREDIENT_META, "fr/cardamom");
    expect((fr!.data as Record<string, unknown>)["translationStaleSince"]).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  test("is a no-op when entry does not exist", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await expect(clearStaleFlag(sidecar, "ingredients", "de/ghost")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// clearStaleFlag — recipes
// ---------------------------------------------------------------------------

describe("clearStaleFlag — recipes", () => {
  test("clears translationStaleSince from the meta entry", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/miso-ramen-de", {
      translationOf: "miso-ramen",
      translationStaleSince: "2026-01-01T00:00:00.000Z",
    });

    await clearStaleFlag(sidecar, "recipes", "miso-ramen-de");

    const meta = await store.get("meta", "recipes/miso-ramen-de");
    expect((meta!.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
  });

  test("preserves other meta fields after clearing", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("meta", "recipes/miso-ramen-de", {
      translationOf: "miso-ramen",
      tags: ["spicy"],
      translationStaleSince: "2026-01-01T00:00:00.000Z",
    });

    await clearStaleFlag(sidecar, "recipes", "miso-ramen-de");

    const meta = await store.get("meta", "recipes/miso-ramen-de");
    const data = meta!.data as Record<string, unknown>;
    expect(data["translationOf"]).toBe("miso-ramen");
    expect(data["tags"]).toEqual(["spicy"]);
  });
});
