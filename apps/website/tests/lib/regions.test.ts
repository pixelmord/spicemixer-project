import { describe, expect, test } from "vite-plus/test";
import { REGIONS, REGION_LABELS, DOT_POSITIONS } from "../../src/lib/regions.ts";

describe("REGIONS", () => {
  test("is a non-empty readonly array", () => {
    expect(REGIONS.length).toBeGreaterThan(0);
  });

  test("has no duplicates", () => {
    expect(new Set(REGIONS).size).toBe(REGIONS.length);
  });

  test("every code is lowercase hyphenated", () => {
    for (const code of REGIONS) {
      expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  test("contains the expected placeholder codes", () => {
    expect(REGIONS).toContain("north-africa");
    expect(REGIONS).toContain("levant");
    expect(REGIONS).toContain("mediterranean");
    expect(REGIONS).toContain("south-asia");
    expect(REGIONS).toContain("east-asia");
    expect(REGIONS).toContain("andean");
  });
});

describe("REGION_LABELS", () => {
  test("every REGIONS code has a REGION_LABELS entry", () => {
    for (const code of REGIONS) {
      expect(REGION_LABELS).toHaveProperty(code);
    }
  });

  test("every label has en and de fields", () => {
    for (const code of REGIONS) {
      expect(typeof REGION_LABELS[code].en).toBe("string");
      expect(REGION_LABELS[code].en.length).toBeGreaterThan(0);
      expect(typeof REGION_LABELS[code].de).toBe("string");
      expect(REGION_LABELS[code].de.length).toBeGreaterThan(0);
    }
  });

  test("no REGION_LABELS entry exists outside REGIONS", () => {
    const extraKeys = Object.keys(REGION_LABELS).filter(
      (k) => !(REGIONS as readonly string[]).includes(k),
    );
    expect(extraKeys).toHaveLength(0);
  });
});

describe("DOT_POSITIONS", () => {
  test("every REGIONS code has a DOT_POSITIONS entry", () => {
    for (const code of REGIONS) {
      expect(DOT_POSITIONS).toHaveProperty(code);
    }
  });

  test("every position has x and y numbers", () => {
    for (const code of REGIONS) {
      expect(typeof DOT_POSITIONS[code].x).toBe("number");
      expect(typeof DOT_POSITIONS[code].y).toBe("number");
    }
  });

  test("no DOT_POSITIONS entry exists outside REGIONS", () => {
    const extraKeys = Object.keys(DOT_POSITIONS).filter(
      (k) => !(REGIONS as readonly string[]).includes(k),
    );
    expect(extraKeys).toHaveLength(0);
  });
});
