import { describe, expect, test } from "vite-plus/test";
import { MIXTURE_KINDS } from "../../src/lib/mixture-schema.ts";

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
