import { describe, expect, test, vi, beforeEach } from "vite-plus/test";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(() => Promise.resolve([])),
}));

const { getEntry, getCollection } = await import("astro:content");
const {
  resolveRefs,
  getPublishedPairings,
  getPairings,
  resolveFeaturedPairings,
  getEffectiveVariants,
} = await import("../../src/lib/recipe-augment.ts");

const EP_CARAWAY = { collection: "ingredients", slug: "caraway" };
const EP_CUMIN = { collection: "ingredients", slug: "cumin" };
const EP_SUMAC = { collection: "ingredients", slug: "sumac" };
const EP_CARDAMOM = { collection: "ingredients", slug: "cardamom" };

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

describe("getPublishedPairings — folder-per-locale shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns locale and slug from folder-per-locale IDs", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/cardamom--cumin",
            data: { endpoints: [EP_CARDAMOM, EP_CUMIN], description: "Warm spice." },
          },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("cardamom--cumin");
    expect(result[0].locale).toBe("en");
    expect(result[0].description).toBe("Warm spice.");
    expect(result[0].endpoints).toEqual([EP_CARDAMOM, EP_CUMIN]);
  });

  test("scopes to locale when locale arg is provided", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "EN desc." },
          },
          {
            id: "de/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "DE desc." },
          },
        ] as never;
      }
      return [] as never;
    });

    const enResult = await getPublishedPairings("en");
    expect(enResult).toHaveLength(1);
    expect(enResult[0].locale).toBe("en");
    expect(enResult[0].description).toBe("EN desc.");

    const deResult = await getPublishedPairings("de");
    expect(deResult).toHaveLength(1);
    expect(deResult[0].locale).toBe("de");
    expect(deResult[0].description).toBe("DE desc.");
  });

  test("aggregates region from ingredients collection via endpoint slugs", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/cardamom--cumin",
            data: { endpoints: [EP_CARDAMOM, EP_CUMIN], description: "x" },
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

    const result = await getPublishedPairings("en");
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
          { id: "en/cumin--sumac", data: { endpoints: [EP_CUMIN, EP_SUMAC], description: "x" } },
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

    const result = await getPublishedPairings("en");
    expect(result[0].regions).toEqual(expect.arrayContaining(["north-africa", "levant"]));
    expect(result[0].regions).toHaveLength(2);
  });

  test("excludes pairings whose pairingMeta has draft=true", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "a" },
          },
          { id: "en/cumin--sumac", data: { endpoints: [EP_CUMIN, EP_SUMAC], description: "b" } },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "en/caraway--cumin", data: { draft: true, aiEvents: [] } }] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings("en");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("cumin--sumac");
  });

  test("includes pairings with no pairingMeta entry (treated as published)", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/cardamom--cumin",
            data: { endpoints: [EP_CARDAMOM, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings("en");
    expect(result).toHaveLength(1);
  });

  test("reads canonicalLocale from pairingMeta", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "de/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "DE." },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [
          { id: "de/caraway--cumin", data: { canonicalLocale: "en", featured: true } },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings();
    expect(result[0].canonicalLocale).toBe("en");
  });

  test("falls back to own locale when no pairingMeta canonicalLocale", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "EN." },
          },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings();
    expect(result[0].canonicalLocale).toBe("en");
  });

  test("filters by locale — DE pairings not returned for EN locale", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/cardamom--cumin",
            data: { endpoints: [EP_CARDAMOM, EP_CUMIN], description: "EN description" },
          },
          {
            id: "de/cardamom--cumin",
            data: { endpoints: [EP_CARDAMOM, EP_CUMIN], description: "DE description" },
          },
        ] as never;
      }
      return [] as never;
    });

    const enResult = await getPublishedPairings("en");
    expect(enResult).toHaveLength(1);
    expect(enResult[0].description).toBe("EN description");

    const deResult = await getPublishedPairings("de");
    expect(deResult).toHaveLength(1);
    expect(deResult[0].description).toBe("DE description");
  });

  test("id in result is slug without locale prefix", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/cardamom--cumin",
            data: { endpoints: [EP_CARDAMOM, EP_CUMIN], description: "" },
          },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings("en");
    expect(result[0].id).toBe("cardamom--cumin");
  });
});

describe("getPairings — folder-per-locale shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("finds pairings by endpoint slug", async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: "en/caraway--cumin", data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "EN." } },
    ] as never);

    const result = await getPairings("caraway");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("caraway--cumin");
  });

  test("prefers requested locale over english", async () => {
    vi.mocked(getCollection).mockResolvedValue([
      {
        id: "en/caraway--cumin",
        data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "EN desc." },
      },
      {
        id: "de/caraway--cumin",
        data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "DE desc." },
      },
    ] as never);

    const result = await getPairings("caraway", "de");
    expect(result).toHaveLength(1);
    expect(result[0].locale).toBe("de");
    expect(result[0].description).toBe("DE desc.");
  });

  test("falls back to EN when requested locale is missing", async () => {
    vi.mocked(getCollection).mockResolvedValue([
      {
        id: "en/caraway--cumin",
        data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "EN only." },
      },
    ] as never);

    const result = await getPairings("caraway", "de");
    expect(result).toHaveLength(1);
    expect(result[0].locale).toBe("en");
    expect(result[0].description).toBe("EN only.");
  });

  test("returns empty array when no pairings contain the slug", async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: "en/caraway--cumin", data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" } },
    ] as never);

    const result = await getPairings("cardamom");
    expect(result).toHaveLength(0);
  });

  test("returns endpoints with full EndpointRef objects", async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: "en/caraway--cumin", data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" } },
    ] as never);

    const result = await getPairings("caraway");
    expect(result[0].endpoints[0]).toEqual(EP_CARAWAY);
    expect(result[0].endpoints[1]).toEqual(EP_CUMIN);
  });

  test("returns featured: true when pairingMeta has featured=true", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "en/caraway--cumin", data: { featured: true, aiEvents: [] } }] as never;
      }
      return [] as never;
    });

    const result = await getPairings("caraway");
    expect(result[0].featured).toBe(true);
  });

  test("returns featured: false when pairingMeta has featured=false", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "en/caraway--cumin", data: { featured: false, aiEvents: [] } }] as never;
      }
      return [] as never;
    });

    const result = await getPairings("caraway");
    expect(result[0].featured).toBe(false);
  });

  test("returns featured: false when no pairingMeta entry exists", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPairings("caraway");
    expect(result[0].featured).toBe(false);
  });
});

describe("getPublishedPairings — featured field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns featured: true when pairingMeta has featured=true", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [
          {
            id: "en/caraway--cumin",
            data: { featured: true, canonicalLocale: "en", aiEvents: [] },
          },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings("en");
    expect(result[0].featured).toBe(true);
  });

  test("returns featured: false when pairingMeta has featured=false", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "en/caraway--cumin", data: { featured: false, aiEvents: [] } }] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings("en");
    expect(result[0].featured).toBe(false);
  });

  test("returns featured: false when no pairingMeta entry exists", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      return [] as never;
    });

    const result = await getPublishedPairings("en");
    expect(result[0].featured).toBe(false);
  });
});

describe("resolveFeaturedPairings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns only featured pairings with resolved names and hrefs", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "Good pair" },
          },
          {
            id: "en/cumin--sumac",
            data: { endpoints: [EP_CUMIN, EP_SUMAC], description: "Also good" },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [
          { id: "en/caraway--cumin", data: { featured: true } },
          { id: "en/cumin--sumac", data: { featured: false } },
        ] as never;
      }
      return [] as never;
    });
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "en/cumin") {
        return { data: { name: "Cumin" } } as never;
      }
      return null as never;
    });

    const result = await resolveFeaturedPairings("caraway", "en", "");
    expect(result).toEqual([
      { href: "/ingredients/cumin/", name: "Cumin", description: "Good pair" },
    ]);
  });

  test("falls back to slug when name resolution returns null", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "desc" },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "en/caraway--cumin", data: { featured: true } }] as never;
      }
      return [] as never;
    });
    vi.mocked(getEntry).mockResolvedValue(null as never);

    const result = await resolveFeaturedPairings("caraway", "en", "/de");
    expect(result).toEqual([
      { href: "/de/ingredients/cumin/", name: "cumin", description: "desc" },
    ]);
  });

  test("returns empty array when no pairings are featured", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          {
            id: "en/caraway--cumin",
            data: { endpoints: [EP_CARAWAY, EP_CUMIN], description: "x" },
          },
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "en/caraway--cumin", data: { featured: false } }] as never;
      }
      return [] as never;
    });

    const result = await resolveFeaturedPairings("caraway", "en", "");
    expect(result).toEqual([]);
  });
});

describe("getEffectiveVariants — canonical-locale meta resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns own meta variants when not a translation", async () => {
    vi.mocked(getCollection).mockResolvedValue([] as never);
    vi.mocked(getEntry).mockResolvedValue(null as never);

    const meta = {
      variants: ["harissa-moroccan", "harissa-lebanese"],
      translationOf: undefined,
      goesWellWith: [],
      usesBase: [],
      ingredientLinks: [],
      externalSources: [],
      tags: [],
    } as Parameters<typeof getEffectiveVariants>[2];

    const result = await getEffectiveVariants("mixtures", "harissa", meta, "en");
    expect(result).toEqual(["harissa-moroccan", "harissa-lebanese"]);
  });

  test("returns canonical meta variants when translationOf is set", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "meta") {
        return [
          {
            id: "mixtures/en/harissa",
            data: { variants: ["harissa-moroccan", "harissa-lebanese"], draft: false },
          },
        ] as never;
      }
      return [] as never;
    });
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "meta" && id === "mixtures/en/harissa") {
        return { data: { variants: ["harissa-moroccan", "harissa-lebanese"] } } as never;
      }
      return null as never;
    });

    const meta = {
      variants: [],
      translationOf: "harissa",
      goesWellWith: [],
      usesBase: [],
      ingredientLinks: [],
      externalSources: [],
      tags: [],
    } as Parameters<typeof getEffectiveVariants>[2];

    const result = await getEffectiveVariants("mixtures", "harissa", meta, "en");
    expect(result).toEqual(["harissa-moroccan", "harissa-lebanese"]);
  });

  test("returns empty array when canonical meta has no variants", async () => {
    vi.mocked(getEntry).mockResolvedValue(null as never);
    vi.mocked(getCollection).mockResolvedValue([] as never);

    const meta = {
      variants: [],
      translationOf: "harissa",
      goesWellWith: [],
      usesBase: [],
      ingredientLinks: [],
      externalSources: [],
      tags: [],
    } as Parameters<typeof getEffectiveVariants>[2];

    const result = await getEffectiveVariants("mixtures", "harissa", meta, "en");
    expect(result).toEqual([]);
  });
});
