import { describe, expect, test, vi, beforeEach } from "vite-plus/test";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(() => Promise.resolve([])),
}));

const { getEntry, getCollection } = await import("astro:content");
const { resolveRefs, getPublishedPairings } = await import("../../src/lib/recipe-augment.ts");

describe("resolveRefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves a 'recipes' collection ref", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "recipes" && id === "en/miso-ramen") {
        return { data: { name: "Miso Ramen" } } as never;
      }
      return null as never;
    });

    const result = await resolveRefs([{ collection: "recipes", slug: "miso-ramen" }], "");
    expect(result).toEqual([{ name: "Miso Ramen", href: "/recipes/miso-ramen/" }]);
  });

  test("resolves a 'mixtures' collection ref", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "mixtures" && id === "en/harissa") {
        return { data: { name: "Harissa" } } as never;
      }
      return null as never;
    });

    const result = await resolveRefs([{ collection: "mixtures", slug: "harissa" }], "");
    expect(result).toEqual([{ name: "Harissa", href: "/mixtures/harissa/" }]);
  });

  test("resolves an 'ingredients' collection ref via en locale entry", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "en/cardamom") {
        return { data: { name: "Cardamom" } } as never;
      }
      return null as never;
    });

    const result = await resolveRefs([{ collection: "ingredients", slug: "cardamom" }], "");
    expect(result).toEqual([{ name: "Cardamom", href: "/ingredients/cardamom/" }]);
  });

  test("omits refs that resolve to null", async () => {
    vi.mocked(getEntry).mockResolvedValue(null as never);

    const result = await resolveRefs([{ collection: "recipes", slug: "ghost" }], "");
    expect(result).toEqual([]);
  });

  test("prepends localePrefix to href", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "mixtures" && id === "de/harissa") {
        return { data: { name: "Harissa" } } as never;
      }
      return null as never;
    });

    const result = await resolveRefs([{ collection: "mixtures", slug: "harissa" }], "/de", "de");
    expect(result).toEqual([{ name: "Harissa", href: "/de/mixtures/harissa/" }]);
  });
});

describe("getPublishedPairings — region from ingredient content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("aggregates region from ingredients collection (not ingredientMeta)", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "cardamom--cumin",
            data: { ingredients: ["cardamom", "cumin"], descriptions: {} },
          },
        ] as never;
      }
      if (name === "ingredients") {
        return [
          { id: "en/cardamom", data: { region: ["south-asia"] } },
          { id: "en/cumin", data: { region: ["north-africa", "levant"] } },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings();
    expect(result).toHaveLength(1);
    expect(result[0].regions).toEqual(
      expect.arrayContaining(["south-asia", "north-africa", "levant"]),
    );
    expect(result[0].regions).toHaveLength(3);
  });

  test("deduplicates regions shared across multiple locales of the same ingredient", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "cumin--sumac",
            data: { ingredients: ["cumin", "sumac"], descriptions: {} },
          },
        ] as never;
      }
      if (name === "ingredients") {
        return [
          { id: "en/cumin", data: { region: ["north-africa"] } },
          { id: "de/cumin", data: { region: ["north-africa"] } },
          { id: "en/sumac", data: { region: ["levant"] } },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings();
    expect(result[0].regions).toEqual(expect.arrayContaining(["north-africa", "levant"]));
    expect(result[0].regions).toHaveLength(2);
  });

  test("excludes pairings whose pairingMeta has draft=true", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          { id: "caraway--cumin", data: { ingredients: ["caraway", "cumin"], descriptions: {} } },
          { id: "cumin--sumac", data: { ingredients: ["cumin", "sumac"], descriptions: {} } },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "caraway--cumin", data: { draft: true, aiEvents: [] } }] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("cumin--sumac");
  });

  test("includes pairings with no pairingMeta entry (treated as published)", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          { id: "cardamom--cumin", data: { ingredients: ["cardamom", "cumin"], descriptions: {} } },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings();
    expect(result).toHaveLength(1);
  });
});
