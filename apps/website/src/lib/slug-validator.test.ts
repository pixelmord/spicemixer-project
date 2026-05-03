import { describe, expect, test } from "vite-plus/test";
import { validateSlug, RESERVED_SLUGS } from "./slug-validator.ts";

describe("validateSlug - reserved slugs", () => {
  test.each([...RESERVED_SLUGS])("rejects reserved slug '%s' for mixtures", (reserved) => {
    const result = validateSlug(reserved, "mixtures");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("reserved");
  });

  test.each([...RESERVED_SLUGS])("rejects reserved slug '%s' for ingredients", (reserved) => {
    const result = validateSlug(reserved, "ingredients");
    expect(result.ok).toBe(false);
  });

  test.each([...RESERVED_SLUGS])("rejects reserved slug '%s' case-insensitively", (reserved) => {
    const upper = reserved.toUpperCase();
    const result = validateSlug(upper, "mixtures");
    expect(result.ok).toBe(false);
  });

  test.each([...RESERVED_SLUGS])("rejects mixed-case variant of reserved slug '%s'", (reserved) => {
    const mixed = reserved[0].toUpperCase() + reserved.slice(1);
    const result = validateSlug(mixed, "mixtures");
    expect(result.ok).toBe(false);
  });

  test.each(["harissa", "caraway", "ras-el-hanout", "berbere", "cumin", "black-pepper"])(
    "accepts non-reserved slug '%s'",
    (slug) => {
      const result = validateSlug(slug, "mixtures");
      expect(result.ok).toBe(true);
    },
  );
});

describe("validateSlug - cross-collection collision", () => {
  test("returns soft warning when mixture slug already exists in ingredients", () => {
    const result = validateSlug("harissa", "mixtures", { ingredients: ["harissa"] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toEqual({
        kind: "cross-collection-collision",
        otherCollection: "ingredients",
        slug: "harissa",
      });
    }
  });

  test("returns soft warning when ingredient slug already exists in mixtures", () => {
    const result = validateSlug("caraway", "ingredients", { mixtures: ["caraway"] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toEqual({
        kind: "cross-collection-collision",
        otherCollection: "mixtures",
        slug: "caraway",
      });
    }
  });

  test("no warning when slug only exists in the same collection", () => {
    const result = validateSlug("harissa", "mixtures", { mixtures: ["harissa"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toBeUndefined();
  });

  test("no warning when existingSlugs is omitted", () => {
    const result = validateSlug("harissa", "mixtures");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toBeUndefined();
  });

  test("no warning when existingSlugs is empty object", () => {
    const result = validateSlug("harissa", "mixtures", {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toBeUndefined();
  });

  test("reserved slug is rejected even if cross-collection match also exists", () => {
    const result = validateSlug("sauces", "mixtures", { ingredients: ["sauces"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("reserved");
  });

  test("no warning when slug does not exist in other collection", () => {
    const result = validateSlug("berbere", "mixtures", {
      ingredients: ["caraway", "cumin"],
      mixtures: ["harissa"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toBeUndefined();
  });
});

describe("RESERVED_SLUGS", () => {
  test("contains all expected plural-kind names", () => {
    const expected = ["sauces", "rubs", "oils", "pickles", "chutneys", "marinades", "spicemixes"];
    for (const slug of expected) {
      expect(RESERVED_SLUGS.has(slug)).toBe(true);
    }
  });
});
