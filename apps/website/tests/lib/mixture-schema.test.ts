import { describe, expect, test } from "vite-plus/test";
import {
  MIXTURE_KINDS,
  MIXTURE_KIND_PLURALS,
  pluralToKind,
  buildKindBySlug,
} from "../../src/lib/mixture-schema.ts";

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
  test("maps each kind to its expected plural", () => {
    expect(MIXTURE_KIND_PLURALS).toEqual({
      spicemix: "spicemixes",
      sauce: "sauces",
      rub: "rubs",
      oil: "oils",
      pickle: "pickles",
      chutney: "chutneys",
      marinade: "marinades",
    });
  });

  test("all plural values are unique", () => {
    const plurals = Object.values(MIXTURE_KIND_PLURALS);
    expect(new Set(plurals).size).toBe(plurals.length);
  });
});

describe("pluralToKind", () => {
  test("is the inverse of MIXTURE_KIND_PLURALS for all kinds", () => {
    for (const kind of MIXTURE_KINDS) {
      expect(pluralToKind(MIXTURE_KIND_PLURALS[kind])).toBe(kind);
    }
  });

  test("returns undefined for an unknown plural", () => {
    expect(pluralToKind("unknown")).toBeUndefined();
  });
});

describe("buildKindBySlug", () => {
  test("extracts kind from mixture meta entries", () => {
    const entries = [
      { id: "mixtures/harissa", data: { kind: "spicemix" } },
      { id: "mixtures/sriracha", data: { kind: "sauce" } },
    ];
    const map = buildKindBySlug(entries);
    expect(map.get("harissa")).toBe("spicemix");
    expect(map.get("sriracha")).toBe("sauce");
  });

  test("skips non-mixture meta entries", () => {
    const entries = [
      { id: "recipes/pasta", data: { kind: "recipe" } },
      { id: "mixtures/harissa", data: { kind: "spicemix" } },
    ];
    const map = buildKindBySlug(entries);
    expect(map.size).toBe(1);
    expect(map.has("pasta")).toBe(false);
  });

  test("skips entries with invalid or missing kind", () => {
    const entries = [
      { id: "mixtures/unknown", data: { kind: "invented" } },
      { id: "mixtures/empty", data: {} },
    ];
    const map = buildKindBySlug(entries);
    expect(map.size).toBe(0);
  });
});
