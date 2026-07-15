import { describe, expect, test } from "vite-plus/test";
import { regionFilterAttr, regionFilterValues } from "../src/lib/region-filter.ts";

describe("regionFilterAttr", () => {
  test("comma-joins regions", () => {
    expect(regionFilterAttr(["north-africa", "levant"])).toBe("north-africa,levant");
  });

  test("handles missing/empty", () => {
    expect(regionFilterAttr(undefined)).toBe("");
    expect(regionFilterAttr([])).toBe("");
  });
});

describe("regionFilterValues", () => {
  const items = [
    { region: ["east-asia"] },
    { region: ["north-africa"] },
    { region: ["north-africa", "mediterranean"] },
    { region: [] },
  ];

  test("includes only regions present in the content", () => {
    const values = regionFilterValues(items, "en").map((v) => v.value);
    expect(values).toContain("north-africa");
    expect(values).toContain("east-asia");
    expect(values).toContain("mediterranean");
    expect(values).not.toContain("oceania");
  });

  test("deduplicates and sorts by canonical REGIONS order", () => {
    const values = regionFilterValues(items, "en").map((v) => v.value);
    expect(values).toEqual([...new Set(values)]);
    // north-africa precedes east-asia in the canonical REGIONS order.
    expect(values.indexOf("north-africa")).toBeLessThan(values.indexOf("east-asia"));
  });

  test("localizes labels", () => {
    const en = regionFilterValues([{ region: ["north-africa"] }], "en");
    const de = regionFilterValues([{ region: ["north-africa"] }], "de");
    expect(en[0].label).toBe("North Africa");
    expect(de[0].label).toBe("Nordafrika");
  });
});
