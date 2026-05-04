import { describe, expect, test } from "vite-plus/test";
import { buildPayload } from "../src/lib/entity-form-payload.ts";

const BASE = {
  slug: "cardamom",
  isNew: false,
  slugAvailable: null as boolean | null,
  collection: "ingredients",
  locale: "en",
  draft: false,
  existingSlugs: {} as Partial<Record<string, string[]>>,
};

describe("buildPayload — slug validation", () => {
  test("missing slug returns missing-slug error", () => {
    const result = buildPayload({ ...BASE, slug: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("missing-slug");
  });

  test("taken slug on new entry returns slug-taken error", () => {
    const result = buildPayload({ ...BASE, isNew: true, slugAvailable: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("slug-taken");
  });

  test("taken slug on existing entry is not an error", () => {
    const result = buildPayload({ ...BASE, isNew: false, slugAvailable: false, locale: "en" });
    expect(result.ok).toBe(true);
  });

  test("available slug on new entry is ok", () => {
    const result = buildPayload({ ...BASE, isNew: true, slugAvailable: true });
    expect(result.ok).toBe(true);
  });

  test("reserved slug returns slug-reserved error", () => {
    const result = buildPayload({ ...BASE, slug: "sauces", collection: "mixtures" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("slug-reserved");
  });

  test("reserved slug (rubs) returns slug-reserved error", () => {
    const result = buildPayload({ ...BASE, slug: "rubs", collection: "mixtures" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("slug-reserved");
  });

  test("non-reserved slug on mixtures collection is ok", () => {
    const result = buildPayload({
      ...BASE,
      slug: "ras-el-hanout",
      collection: "mixtures",
      mixtureKind: "spicemix",
    });
    expect(result.ok).toBe(true);
  });

  test("cross-collection collision returns warning but ok:true", () => {
    const result = buildPayload({
      ...BASE,
      slug: "sumac",
      collection: "mixtures",
      mixtureKind: "spicemix",
      existingSlugs: { ingredients: ["sumac"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe("cross-collection-collision");
      expect(result.warnings[0].otherCollection).toBe("ingredients");
    }
  });
});

describe("buildPayload — locale validation", () => {
  test("missing locale on ingredient (new) returns missing-locale error", () => {
    const result = buildPayload({
      ...BASE,
      kind: "ingredient",
      locale: "",
      isNew: true,
      slugAvailable: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("missing-locale");
  });

  test("missing locale on recipe (new) returns missing-locale error", () => {
    const result = buildPayload({
      ...BASE,
      kind: "recipe",
      collection: "recipes",
      locale: "",
      isNew: true,
      slugAvailable: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("missing-locale");
  });

  test("missing locale on pairing does not return missing-locale error", () => {
    const result = buildPayload({
      ...BASE,
      kind: "pairing",
      collection: "pairings",
      locale: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.errors ?? []).toHaveLength(0);
    }
  });

  test("set locale on ingredient is ok", () => {
    const result = buildPayload({ ...BASE, kind: "ingredient", locale: "en" });
    expect(result.ok).toBe(true);
  });
});

describe("buildPayload — mixtures kind", () => {
  test("mixtures collection without kind returns missing-kind error", () => {
    const result = buildPayload({ ...BASE, collection: "mixtures", mixtureKind: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("missing-kind");
  });

  test("mixtures collection without mixtureKind field returns missing-kind error", () => {
    const result = buildPayload({ ...BASE, collection: "mixtures" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("missing-kind");
  });

  test("mixtures collection with valid kind is ok", () => {
    const result = buildPayload({ ...BASE, collection: "mixtures", mixtureKind: "spicemix" });
    expect(result.ok).toBe(true);
  });

  test("non-mixture collection without mixtureKind is ok", () => {
    const result = buildPayload({ ...BASE, collection: "recipes" });
    expect(result.ok).toBe(true);
  });
});

describe("buildPayload — draft flag", () => {
  test("draft:true passes through to success payload", () => {
    const result = buildPayload({ ...BASE, draft: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(true);
  });

  test("draft:false passes through to success payload", () => {
    const result = buildPayload({ ...BASE, draft: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(false);
  });
});

describe("buildPayload — success payload shape", () => {
  test("success result carries slug and locale", () => {
    const result = buildPayload({ ...BASE, slug: "cumin", locale: "de" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slug).toBe("cumin");
      expect(result.locale).toBe("de");
    }
  });

  test("success result has empty warnings array when no collision", () => {
    const result = buildPayload({ ...BASE });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual([]);
  });
});
