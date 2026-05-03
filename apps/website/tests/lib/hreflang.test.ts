import { describe, expect, test, vi, beforeEach } from "vite-plus/test";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(() => Promise.resolve([])),
}));

const { getEntry } = await import("astro:content");
const { hreflangTags } = await import("../../src/lib/hreflang.ts");

function makeEntry(id: string, data: Record<string, unknown> = {}) {
  return { id, data };
}

describe("hreflangTags — ingredients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("single-locale entry → one lang tag + x-default", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "en/cumin") return makeEntry("en/cumin") as never;
      if (collection === "ingredientMeta" && id === "en/cumin")
        return makeEntry("en/cumin", { canonicalLocale: "en", draft: false }) as never;
      return null as never;
    });

    const tags = await hreflangTags("cumin", "ingredients");
    expect(tags).toHaveLength(2);
    expect(tags).toContainEqual({ hrefLang: "en", href: "/ingredients/cumin/" });
    expect(tags).toContainEqual({ hrefLang: "x-default", href: "/ingredients/cumin/" });
  });

  test("two-locale entry → both lang tags + x-default", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && (id === "en/cardamom" || id === "de/cardamom"))
        return makeEntry(id as string) as never;
      if (collection === "ingredientMeta" && id === "en/cardamom")
        return makeEntry("en/cardamom", { canonicalLocale: "en", draft: false }) as never;
      if (collection === "ingredientMeta" && id === "de/cardamom")
        return makeEntry("de/cardamom", { draft: false }) as never;
      return null as never;
    });

    const tags = await hreflangTags("cardamom", "ingredients");
    expect(tags).toHaveLength(3);
    expect(tags).toContainEqual({ hrefLang: "en", href: "/ingredients/cardamom/" });
    expect(tags).toContainEqual({ hrefLang: "de", href: "/de/ingredients/cardamom/" });
    expect(tags).toContainEqual({ hrefLang: "x-default", href: "/ingredients/cardamom/" });
  });

  test("x-default points to canonical locale URL", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "de/saffron")
        return makeEntry("de/saffron") as never;
      if (collection === "ingredientMeta" && id === "de/saffron")
        return makeEntry("de/saffron", { canonicalLocale: "de", draft: false }) as never;
      return null as never;
    });

    const tags = await hreflangTags("saffron", "ingredients");
    const xDefault = tags.find((t) => t.hrefLang === "x-default");
    expect(xDefault?.href).toBe("/de/ingredients/saffron/");
  });

  test("baseUrl prefix is applied to all hrefs", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "ingredients" && id === "en/cumin") return makeEntry("en/cumin") as never;
      if (collection === "ingredientMeta" && id === "en/cumin")
        return makeEntry("en/cumin", { canonicalLocale: "en", draft: false }) as never;
      return null as never;
    });

    const tags = await hreflangTags("cumin", "ingredients", "https://spicemixer.example.com");
    expect(tags).toContainEqual({
      hrefLang: "en",
      href: "https://spicemixer.example.com/ingredients/cumin/",
    });
    expect(tags).toContainEqual({
      hrefLang: "x-default",
      href: "https://spicemixer.example.com/ingredients/cumin/",
    });
  });
});

describe("hreflangTags — recipes / mixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("recipe: both active locales get tags since content serves all locales", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "recipes" && id === "miso-ramen") return makeEntry("miso-ramen") as never;
      if (collection === "meta" && id === "recipes/miso-ramen")
        return makeEntry("recipes/miso-ramen", { draft: false, canonicalLocale: "en" }) as never;
      return null as never;
    });

    const tags = await hreflangTags("miso-ramen", "recipes");
    expect(tags).toContainEqual({ hrefLang: "en", href: "/recipes/miso-ramen/" });
    expect(tags).toContainEqual({ hrefLang: "de", href: "/de/recipes/miso-ramen/" });
    expect(tags).toContainEqual({ hrefLang: "x-default", href: "/recipes/miso-ramen/" });
  });

  test("mixture: x-default points to canonical locale URL", async () => {
    vi.mocked(getEntry).mockImplementation(async (collection, id) => {
      if (collection === "mixtures" && id === "harissa") return makeEntry("harissa") as never;
      if (collection === "meta" && id === "mixtures/harissa")
        return makeEntry("mixtures/harissa", { draft: false, canonicalLocale: "en" }) as never;
      return null as never;
    });

    const tags = await hreflangTags("harissa", "mixtures");
    const xDefault = tags.find((t) => t.hrefLang === "x-default");
    expect(xDefault?.href).toBe("/mixtures/harissa/");
  });
});
