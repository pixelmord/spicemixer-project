import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetItem = vi.fn();

vi.mock("astro:actions", () => ({
  actions: {
    getItem: mockGetItem,
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { getSiblingEntity } = await import("../src/lib/get-sibling-entity.ts");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIngredientItem(data: Record<string, unknown>) {
  return { data: { item: { data }, meta: null }, error: null };
}

function makeRecipeItem(
  data: Record<string, unknown>,
  meta: Record<string, unknown> | null = null,
) {
  return { data: { item: { data }, meta }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Ingredient (shared-slug path) ─────────────────────────────────────────────

describe("getSiblingEntity — ingredient (shared-slug path)", () => {
  test("fetches ingredient by <sibling-locale>/<slug>", async () => {
    const siblingData = { name: "Kardamom", description: "Ein aromatisches Gewürz" };
    mockGetItem.mockResolvedValue(makeIngredientItem(siblingData));

    const result = await getSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de" });

    expect(mockGetItem).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "ingredients", id: "de/cardamom" }),
    );
    expect(result).not.toBeNull();
  });

  test("returns correct ref with kind and locale-prefixed id", async () => {
    const siblingData = { name: "Kardamom" };
    mockGetItem.mockResolvedValue(makeIngredientItem(siblingData));

    const result = await getSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de" });

    expect(result?.ref).toEqual({ kind: "ingredient", id: "de/cardamom" });
  });

  test("returns sibling data", async () => {
    const siblingData = { name: "Kardamom", description: "Ein aromatisches Gewürz" };
    mockGetItem.mockResolvedValue(makeIngredientItem(siblingData));

    const result = await getSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de" });

    expect(result?.data).toEqual(siblingData);
    expect(result?.locale).toBe("de");
  });

  test("returns non-empty fieldHashes computed from data", async () => {
    const siblingData = { name: "Kardamom" };
    mockGetItem.mockResolvedValue(makeIngredientItem(siblingData));

    const result = await getSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de" });

    expect(result?.fieldHashes).toBeDefined();
    expect(result?.fieldHashes.name).toBe("Kardamom");
  });

  test("returns null when ingredient is not found", async () => {
    mockGetItem.mockResolvedValue({ data: null, error: null });

    const result = await getSiblingEntity({ kind: "ingredient", slug: "unknown", locale: "de" });

    expect(result).toBeNull();
  });

  test("returns null on action error", async () => {
    mockGetItem.mockResolvedValue({ data: null, error: new Error("not found") });

    const result = await getSiblingEntity({ kind: "ingredient", slug: "cardamom", locale: "de" });

    expect(result).toBeNull();
  });
});

// ── Pairing (shared-slug path) ────────────────────────────────────────────────

describe("getSiblingEntity — pairing (shared-slug path)", () => {
  test("fetches pairing by <sibling-locale>/<slug>", async () => {
    const siblingData = { description: "Ein aromatisches Paar" };
    mockGetItem.mockResolvedValue({
      data: { item: { data: siblingData }, meta: null },
      error: null,
    });

    const result = await getSiblingEntity({
      kind: "pairing",
      slug: "cardamom-coffee",
      locale: "de",
    });

    expect(mockGetItem).toHaveBeenCalledWith(expect.objectContaining({ id: "de/cardamom-coffee" }));
    expect(result?.ref).toEqual({ kind: "pairing", id: "de/cardamom-coffee" });
  });
});

// ── Recipe (translations-map path) ────────────────────────────────────────────

describe("getSiblingEntity — recipe (translations-map path)", () => {
  test("resolves sibling via translations map and fetches translated recipe", async () => {
    const sourceMeta = { translations: { de: "kardamom-kuchen-de" } };
    const sourceData = { name: "Cardamom Cake" };
    const siblingData = { name: "Kardamom-Kuchen" };

    mockGetItem
      .mockResolvedValueOnce(makeRecipeItem(sourceData, sourceMeta)) // source fetch
      .mockResolvedValueOnce(makeRecipeItem(siblingData, null)); // sibling fetch

    const result = await getSiblingEntity({
      kind: "recipe",
      slug: "cardamom-cake",
      locale: "de",
      currentLocale: "en",
    });

    expect(mockGetItem).toHaveBeenCalledTimes(2);
    expect(mockGetItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ collection: "recipes", id: "en/cardamom-cake" }),
    );
    expect(mockGetItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: "recipes", id: "de/kardamom-kuchen-de" }),
    );
    expect(result?.ref).toEqual({ kind: "recipe", id: "de/kardamom-kuchen-de" });
    expect(result?.data).toEqual(siblingData);
    expect(result?.locale).toBe("de");
  });

  test("returns null when no translation exists for sibling locale", async () => {
    const sourceMeta = { translations: {} }; // no German translation
    const sourceData = { name: "Cardamom Cake" };

    mockGetItem.mockResolvedValueOnce(makeRecipeItem(sourceData, sourceMeta));

    const result = await getSiblingEntity({
      kind: "recipe",
      slug: "cardamom-cake",
      locale: "de",
      currentLocale: "en",
    });

    expect(result).toBeNull();
    expect(mockGetItem).toHaveBeenCalledTimes(1);
  });

  test("returns null when source entity is not found", async () => {
    mockGetItem.mockResolvedValueOnce({ data: null, error: new Error("not found") });

    const result = await getSiblingEntity({
      kind: "recipe",
      slug: "cardamom-cake",
      locale: "de",
      currentLocale: "en",
    });

    expect(result).toBeNull();
  });

  test("returns null when currentLocale is not provided for recipe", async () => {
    const result = await getSiblingEntity({
      kind: "recipe",
      slug: "cardamom-cake",
      locale: "de",
      // currentLocale omitted intentionally
    });

    expect(result).toBeNull();
  });

  test("infers currentLocale from locale-prefixed slug when provided", async () => {
    const sourceMeta = { translations: { de: "kardamom-kuchen-de" } };
    const sourceData = { name: "Cardamom Cake" };
    const siblingData = { name: "Kardamom-Kuchen" };

    mockGetItem
      .mockResolvedValueOnce(makeRecipeItem(sourceData, sourceMeta))
      .mockResolvedValueOnce(makeRecipeItem(siblingData, null));

    const result = await getSiblingEntity({
      kind: "recipe",
      slug: "en/cardamom-cake", // locale-prefixed slug
      locale: "de",
      // no currentLocale — should be inferred from slug prefix
    });

    expect(mockGetItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "en/cardamom-cake" }),
    );
    expect(result?.ref).toEqual({ kind: "recipe", id: "de/kardamom-kuchen-de" });
  });
});

// ── Mixture (translations-map path) ──────────────────────────────────────────

describe("getSiblingEntity — mixture (translations-map path)", () => {
  test("fetches from mixtures collection", async () => {
    const sourceMeta = { translations: { de: "mojo-verde-de" } };
    const sourceData = { name: "Mojo Verde" };
    const siblingData = { name: "Mojo Verde DE" };

    mockGetItem
      .mockResolvedValueOnce(makeRecipeItem(sourceData, sourceMeta))
      .mockResolvedValueOnce(makeRecipeItem(siblingData, null));

    const result = await getSiblingEntity({
      kind: "mixture",
      slug: "mojo-verde",
      locale: "de",
      currentLocale: "en",
    });

    expect(mockGetItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ collection: "mixtures", id: "en/mojo-verde" }),
    );
    expect(result?.ref).toEqual({ kind: "mixture", id: "de/mojo-verde-de" });
  });
});
