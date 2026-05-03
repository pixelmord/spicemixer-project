import { describe, expect, test, vi, beforeEach } from "vite-plus/test";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(() => Promise.resolve([])),
}));

const { getEntry, getCollection } = await import("astro:content");
const { resolvePublished } = await import("../../src/lib/published-entity.ts");

function makeEntry(id: string, data: Record<string, unknown> = {}) {
  return { id, data };
}

describe("resolvePublished — ingredients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("entity exists in requested locale — no fallback", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "de/cardamom")
        return makeEntry("de/cardamom", { name: "Kardamom" }) as never;
      if (collection === "ingredientMeta" && id === "de/cardamom")
        return makeEntry("de/cardamom", { draft: false }) as never;
      if (collection === "ingredientMeta" && id === "en/cardamom")
        return makeEntry("en/cardamom", { canonicalLocale: "en" }) as never;
      return null as never;
    });

    const result = await resolvePublished("ingredients", "cardamom", "de");
    expect(result).not.toBeNull();
    expect(result!.isFallback).toBe(false);
    expect(result!.renderedLocale).toBe("de");
    expect(result!.canonicalLocale).toBe("en");
    expect((result!.entity as ReturnType<typeof makeEntry>).data.name).toBe("Kardamom");
  });

  test("entity exists only in canonical locale — fallback returned", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "en/cardamom")
        return makeEntry("en/cardamom", { name: "Cardamom" }) as never;
      if (collection === "ingredientMeta" && id === "en/cardamom")
        return makeEntry("en/cardamom", { canonicalLocale: "en", draft: false }) as never;
      return null as never;
    });
    vi.mocked(getCollection).mockResolvedValue([]);

    const result = await resolvePublished("ingredients", "cardamom", "de");
    expect(result).not.toBeNull();
    expect(result!.isFallback).toBe(true);
    expect(result!.renderedLocale).toBe("en");
    expect(result!.canonicalLocale).toBe("en");
    expect((result!.entity as ReturnType<typeof makeEntry>).data.name).toBe("Cardamom");
  });

  test("entity exists but is draft — returns null", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "en/cardamom")
        return makeEntry("en/cardamom", { name: "Cardamom" }) as never;
      if (collection === "ingredientMeta" && id === "en/cardamom")
        return makeEntry("en/cardamom", { draft: true, canonicalLocale: "en" }) as never;
      return null as never;
    });

    const result = await resolvePublished("ingredients", "cardamom", "en");
    expect(result).toBeNull();
  });

  test("entity does not exist in any locale — returns null", async () => {
    vi.mocked(getEntry).mockResolvedValue(null as never);
    vi.mocked(getCollection).mockResolvedValue([]);

    const result = await resolvePublished("ingredients", "ghost", "de");
    expect(result).toBeNull();
  });

  test("entity has both locales but requested is draft — falls back to canonical", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "de/cardamom")
        return makeEntry("de/cardamom", { name: "Kardamom (Draft)" }) as never;
      if (collection === "ingredientMeta" && id === "de/cardamom")
        return makeEntry("de/cardamom", { draft: true }) as never;
      if (collection === "ingredients" && id === "en/cardamom")
        return makeEntry("en/cardamom", { name: "Cardamom" }) as never;
      if (collection === "ingredientMeta" && id === "en/cardamom")
        return makeEntry("en/cardamom", { canonicalLocale: "en", draft: false }) as never;
      return null as never;
    });

    const result = await resolvePublished("ingredients", "cardamom", "de");
    expect(result).not.toBeNull();
    expect(result!.isFallback).toBe(true);
    expect(result!.renderedLocale).toBe("en");
    expect((result!.entity as ReturnType<typeof makeEntry>).data.name).toBe("Cardamom");
  });

  test("canonical entry is also draft — returns null even when requested is missing", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "en/cardamom")
        return makeEntry("en/cardamom", { name: "Cardamom" }) as never;
      if (collection === "ingredientMeta" && id === "en/cardamom")
        return makeEntry("en/cardamom", { canonicalLocale: "en", draft: true }) as never;
      return null as never;
    });
    vi.mocked(getCollection).mockResolvedValue([]);

    const result = await resolvePublished("ingredients", "cardamom", "de");
    expect(result).toBeNull();
  });
});

describe("resolvePublished — recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns the recipe with no fallback", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "recipes" && id === "miso-ramen")
        return makeEntry("miso-ramen", { name: "Miso Ramen" }) as never;
      if (collection === "meta" && id === "recipes/miso-ramen")
        return makeEntry("recipes/miso-ramen", { draft: false, canonicalLocale: "en" }) as never;
      return null as never;
    });

    const result = await resolvePublished("recipes", "miso-ramen", "de");
    expect(result).not.toBeNull();
    expect(result!.isFallback).toBe(false);
    expect(result!.renderedLocale).toBe("de");
    expect(result!.canonicalLocale).toBe("en");
  });

  test("draft recipe returns null", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "recipes" && id === "ghost-recipe")
        return makeEntry("ghost-recipe", { name: "Ghost" }) as never;
      if (collection === "meta" && id === "recipes/ghost-recipe")
        return makeEntry("recipes/ghost-recipe", { draft: true }) as never;
      return null as never;
    });

    const result = await resolvePublished("recipes", "ghost-recipe", "en");
    expect(result).toBeNull();
  });

  test("missing recipe returns null", async () => {
    vi.mocked(getEntry).mockResolvedValue(null as never);

    const result = await resolvePublished("recipes", "nonexistent", "en");
    expect(result).toBeNull();
  });

  test("missing meta treated as published (no-sidecar legacy entries)", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "recipes" && id === "legacy-recipe")
        return makeEntry("legacy-recipe", { name: "Legacy" }) as never;
      return null as never;
    });

    const result = await resolvePublished("recipes", "legacy-recipe", "en");
    expect(result).not.toBeNull();
    expect(result!.isFallback).toBe(false);
  });

  test("mixtures follow same pattern — no fallback", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "mixtures" && id === "harissa")
        return makeEntry("harissa", { name: "Harissa" }) as never;
      if (collection === "meta" && id === "mixtures/harissa")
        return makeEntry("mixtures/harissa", { draft: false, canonicalLocale: "en" }) as never;
      return null as never;
    });

    const result = await resolvePublished("mixtures", "harissa", "de");
    expect(result).not.toBeNull();
    expect(result!.isFallback).toBe(false);
    expect(result!.canonicalLocale).toBe("en");
  });
});
