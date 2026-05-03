import { describe, expect, test } from "vite-plus/test";
import { MIXTURE_KINDS, MIXTURE_KIND_PLURALS, pluralToKind } from "../../src/lib/mixture-schema.ts";

describe("MIXTURE_KINDS", () => {
  test("has exactly seven values", () => {
    expect(MIXTURE_KINDS).toHaveLength(7);
  });

  test("contains all required mixture kinds", () => {
    const kinds = [...MIXTURE_KINDS];
    expect(kinds).toContain("spicemix");
    expect(kinds).toContain("sauce");
    expect(kinds).toContain("rub");
    expect(kinds).toContain("oil");
    expect(kinds).toContain("pickle");
    expect(kinds).toContain("chutney");
    expect(kinds).toContain("marinade");
  });

  test("does not contain recipe", () => {
    expect([...MIXTURE_KINDS]).not.toContain("recipe");
  });

  test("has no duplicates", () => {
    expect(new Set(MIXTURE_KINDS).size).toBe(MIXTURE_KINDS.length);
  });
});

describe("MIXTURE_KIND_PLURALS", () => {
  test("has an entry for every kind", () => {
    for (const kind of MIXTURE_KINDS) {
      expect(MIXTURE_KIND_PLURALS[kind]).toBeTruthy();
    }
  });

  test("spicemix maps to spicemixes", () => {
    expect(MIXTURE_KIND_PLURALS.spicemix).toBe("spicemixes");
  });

  test("sauce maps to sauces", () => {
    expect(MIXTURE_KIND_PLURALS.sauce).toBe("sauces");
  });

  test("rub maps to rubs", () => {
    expect(MIXTURE_KIND_PLURALS.rub).toBe("rubs");
  });

  test("oil maps to oils", () => {
    expect(MIXTURE_KIND_PLURALS.oil).toBe("oils");
  });

  test("pickle maps to pickles", () => {
    expect(MIXTURE_KIND_PLURALS.pickle).toBe("pickles");
  });

  test("chutney maps to chutneys", () => {
    expect(MIXTURE_KIND_PLURALS.chutney).toBe("chutneys");
  });

  test("marinade maps to marinades", () => {
    expect(MIXTURE_KIND_PLURALS.marinade).toBe("marinades");
  });

  test("all plural values match RESERVED_SLUGS", () => {
    const plurals = Object.values(MIXTURE_KIND_PLURALS);
    expect(plurals).toHaveLength(7);
    expect(new Set(plurals).size).toBe(7);
  });
});

describe("pluralToKind", () => {
  test("maps sauces to sauce", () => {
    expect(pluralToKind("sauces")).toBe("sauce");
  });

  test("maps spicemixes to spicemix", () => {
    expect(pluralToKind("spicemixes")).toBe("spicemix");
  });

  test("maps rubs to rub", () => {
    expect(pluralToKind("rubs")).toBe("rub");
  });

  test("maps oils to oil", () => {
    expect(pluralToKind("oils")).toBe("oil");
  });

  test("maps pickles to pickle", () => {
    expect(pluralToKind("pickles")).toBe("pickle");
  });

  test("maps chutneys to chutney", () => {
    expect(pluralToKind("chutneys")).toBe("chutney");
  });

  test("maps marinades to marinade", () => {
    expect(pluralToKind("marinades")).toBe("marinade");
  });

  test("returns undefined for an unknown plural", () => {
    expect(pluralToKind("unknown")).toBeUndefined();
  });

  test("is the inverse of MIXTURE_KIND_PLURALS for all kinds", () => {
    for (const kind of MIXTURE_KINDS) {
      expect(pluralToKind(MIXTURE_KIND_PLURALS[kind])).toBe(kind);
    }
  });
});
