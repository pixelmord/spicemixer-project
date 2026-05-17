import { describe, expect, test, vi, beforeEach } from "vite-plus/test";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(() => Promise.resolve([])),
}));

const { getCollection } = await import("astro:content");
const { pairingSlugPaths } = await import("../../src/lib/static-paths/pairing-slug-paths.ts");

const EP_CARAWAY = { collection: "ingredients", slug: "caraway" };
const EP_CUMIN = { collection: "ingredients", slug: "cumin" };
const EP_CARDAMOM = { collection: "ingredients", slug: "cardamom" };
const EP_SAFFRON = { collection: "ingredients", slug: "saffron" };

function makePairingEntry(id: string, endpoints: object[], description: string) {
  return { id, data: { endpoints, description } };
}

describe("pairingSlugPaths — locale-aware routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns EN path when EN pairing exists", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [makePairingEntry("en/caraway--cumin", [EP_CARAWAY, EP_CUMIN], "EN desc.")] as never;
      }
      return [] as never;
    });

    const paths = await pairingSlugPaths("en");
    expect(paths).toHaveLength(1);
    expect(paths[0].params.slug).toBe("caraway--cumin");
    expect(paths[0].props.isFallback).toBe(false);
    expect(paths[0].props.pairing.locale).toBe("en");
    expect(paths[0].props.pairing.description).toBe("EN desc.");
  });

  test("returns DE path when DE pairing exists", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          makePairingEntry("en/caraway--cumin", [EP_CARAWAY, EP_CUMIN], "EN desc."),
          makePairingEntry("de/caraway--cumin", [EP_CARAWAY, EP_CUMIN], "DE desc."),
        ] as never;
      }
      return [] as never;
    });

    const paths = await pairingSlugPaths("de");
    expect(paths).toHaveLength(1);
    expect(paths[0].params.slug).toBe("caraway--cumin");
    expect(paths[0].props.isFallback).toBe(false);
    expect(paths[0].props.pairing.locale).toBe("de");
    expect(paths[0].props.pairing.description).toBe("DE desc.");
  });

  test("falls back to EN with isFallback=true when DE pairing is missing", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          makePairingEntry("en/cardamom--saffron", [EP_CARDAMOM, EP_SAFFRON], "EN only."),
        ] as never;
      }
      return [] as never;
    });

    const paths = await pairingSlugPaths("de");
    expect(paths).toHaveLength(1);
    expect(paths[0].params.slug).toBe("cardamom--saffron");
    expect(paths[0].props.isFallback).toBe(true);
    expect(paths[0].props.pairing.locale).toBe("en");
    expect(paths[0].props.pairing.description).toBe("EN only.");
  });

  test("no fallback flag when DE pairing is also present (bilateral)", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          makePairingEntry("en/caraway--cumin", [EP_CARAWAY, EP_CUMIN], "EN."),
          makePairingEntry("de/caraway--cumin", [EP_CARAWAY, EP_CUMIN], "DE."),
        ] as never;
      }
      return [] as never;
    });

    const paths = await pairingSlugPaths("de");
    expect(paths[0].props.isFallback).toBe(false);
  });

  test("includes canonicalLocale from pairingMeta", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          makePairingEntry("de/cardamom--saffron", [EP_CARDAMOM, EP_SAFFRON], "DE desc."),
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "de/cardamom--saffron", data: { canonicalLocale: "en" } }] as never;
      }
      return [] as never;
    });

    const paths = await pairingSlugPaths("de");
    expect(paths[0].props.canonicalLocale).toBe("en");
  });

  test("excludes drafts from paths", async () => {
    vi.mocked(getCollection).mockImplementation(async (name) => {
      if (name === "pairings") {
        return [
          makePairingEntry("en/caraway--cumin", [EP_CARAWAY, EP_CUMIN], "draft pairing"),
          makePairingEntry("en/cardamom--saffron", [EP_CARDAMOM, EP_SAFFRON], "published pairing"),
        ] as never;
      }
      if (name === "pairingMeta") {
        return [{ id: "en/caraway--cumin", data: { draft: true } }] as never;
      }
      return [] as never;
    });

    const paths = await pairingSlugPaths("en");
    expect(paths).toHaveLength(1);
    expect(paths[0].params.slug).toBe("cardamom--saffron");
  });

  test("returns empty array when no pairings exist", async () => {
    vi.mocked(getCollection).mockResolvedValue([] as never);
    const paths = await pairingSlugPaths("en");
    expect(paths).toHaveLength(0);
  });
});
