import { describe, expect, test } from "vite-plus/test";
import { groupBySlug } from "../../src/lib/admin-list-rows.ts";

describe("groupBySlug", () => {
  // tracer bullet
  test("single item produces one group with its locale in translations", () => {
    const items = [{ id: "en/harissa", data: {}, updatedAt: "2024-01-01" }];
    const groups = groupBySlug(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.slug).toBe("harissa");
    expect(groups[0]!.translations).toEqual(["en"]);
    expect(groups[0]!.primary).toBe(items[0]);
  });

  test("two locale variants of same slug become one group with both locales sorted", () => {
    const items = [
      { id: "de/harissa", data: {}, updatedAt: "2024-01-01" },
      { id: "en/harissa", data: {}, updatedAt: "2024-01-02" },
    ];
    const groups = groupBySlug(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.translations).toEqual(["de", "en"]);
  });

  test("en/ item is selected as primary when multiple locales present", () => {
    const de = { id: "de/harissa", data: {}, updatedAt: "2024-01-01" };
    const en = { id: "en/harissa", data: {}, updatedAt: "2024-01-02" };
    const groups = groupBySlug([de, en]);
    expect(groups[0]!.primary).toBe(en);
  });

  test("falls back to first item as primary when no en/ variant exists", () => {
    const de = { id: "de/harissa", data: {} };
    const fr = { id: "fr/harissa", data: {} };
    const groups = groupBySlug([de, fr]);
    expect(groups[0]!.primary).toBe(de);
  });

  test("items without a locale prefix (no slash) are skipped", () => {
    const items = [
      { id: "harissa", data: {} },
      { id: "en/berbere", data: {} },
    ];
    const groups = groupBySlug(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.slug).toBe("berbere");
  });

  test("two different slugs produce two separate groups", () => {
    const items = [
      { id: "en/harissa", data: {} },
      { id: "en/berbere", data: {} },
    ];
    const groups = groupBySlug(items);
    expect(groups).toHaveLength(2);
    const slugs = groups.map((g) => g.slug).sort();
    expect(slugs).toEqual(["berbere", "harissa"]);
  });

  test("empty input produces empty output", () => {
    expect(groupBySlug([])).toEqual([]);
  });

  test("merges groups whose meta.translations cross-reference each other", () => {
    const en = { id: "en/vegetable-beef-skillet", data: {} };
    const de = { id: "de/gemuese-rindfleisch-pfanne", data: {} };
    const translations: Record<string, Record<string, string>> = {
      "en/vegetable-beef-skillet": { de: "gemuese-rindfleisch-pfanne" },
      "de/gemuese-rindfleisch-pfanne": { en: "vegetable-beef-skillet" },
    };
    const groups = groupBySlug([en, de], (item) => translations[item.id]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.translations).toEqual(["de", "en"]);
    expect(groups[0]!.primary).toBe(en);
    expect(groups[0]!.slug).toBe("vegetable-beef-skillet");
  });

  test("one-sided meta.translations linkage is enough to merge", () => {
    const en = { id: "en/vegetable-beef-skillet", data: {} };
    const de = { id: "de/gemuese-rindfleisch-pfanne", data: {} };
    const translations: Record<string, Record<string, string>> = {
      "en/vegetable-beef-skillet": { de: "gemuese-rindfleisch-pfanne" },
    };
    const groups = groupBySlug([en, de], (item) => translations[item.id]);
    expect(groups).toHaveLength(1);
  });

  test("stale translations pointer to non-existent slug doesn't merge with anything else", () => {
    const en = { id: "en/harissa", data: {} };
    const berbere = { id: "en/berbere", data: {} };
    const translations: Record<string, Record<string, string>> = {
      "en/harissa": { de: "missing-slug" },
    };
    const groups = groupBySlug([en, berbere], (item) => translations[item.id]);
    expect(groups).toHaveLength(2);
  });

  test("localeItems contains all variants for a slug", () => {
    const de = { id: "de/ras-el-hanout", data: {} };
    const en = { id: "en/ras-el-hanout", data: {} };
    const groups = groupBySlug([de, en]);
    expect(groups[0]!.localeItems).toHaveLength(2);
    expect(groups[0]!.localeItems).toContain(de);
    expect(groups[0]!.localeItems).toContain(en);
  });
});
