import { describe, expect, test, vi, beforeEach } from "vite-plus/test";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(() => Promise.resolve([])),
}));

const { getEntry } = await import("astro:content");
const { resolveRefs } = await import("../../src/lib/recipe-augment.ts");

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
