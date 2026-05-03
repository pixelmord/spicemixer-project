import { describe, expect, test } from "vite-plus/test";
import { useTranslations } from "../../src/i18n/translations.ts";

describe("two-tier nav translation keys", () => {
  test("content-tier keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("nav.mixtures")).toBe("Mixtures");
    expect(t("nav.pairings")).toBe("Pairings");
    expect(t("nav.ingredients")).toBe("Ingredients");
    expect(t("nav.recipes")).toBe("Recipes");
  });

  test("lens-tier keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("nav.search")).toBe("Search");
    expect(t("nav.cookMode")).toBe("Cook Mode");
    expect(t("nav.worldmap")).toBe("Worldmap");
  });

  test("section header keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("nav.sectionContent")).toBe("Collections");
    expect(t("nav.sectionLens")).toBe("Explore");
  });

  test("DE has translations for all new nav keys", () => {
    const t = useTranslations("de");
    expect(t("nav.mixtures")).toBeTruthy();
    expect(t("nav.pairings")).toBeTruthy();
    expect(t("nav.search")).toBeTruthy();
    expect(t("nav.cookMode")).toBeTruthy();
    expect(t("nav.worldmap")).toBeTruthy();
    expect(t("nav.sectionContent")).toBeTruthy();
    expect(t("nav.sectionLens")).toBeTruthy();
  });

  test("open/close menu keys present in both locales", () => {
    const en = useTranslations("en");
    const de = useTranslations("de");
    expect(en("nav.openMenu")).toBeTruthy();
    expect(en("nav.closeMenu")).toBeTruthy();
    expect(de("nav.openMenu")).toBeTruthy();
    expect(de("nav.closeMenu")).toBeTruthy();
  });
});

describe("mixture kind label keys", () => {
  const ALL_KINDS = ["spicemix", "sauce", "rub", "oil", "pickle", "chutney", "marinade"] as const;

  test("all 7 kind labels present in EN", () => {
    const t = useTranslations("en");
    for (const kind of ALL_KINDS) {
      expect(t(`kind.${kind}`)).toBeTruthy();
    }
  });

  test("all 7 kind labels present in DE", () => {
    const t = useTranslations("de");
    for (const kind of ALL_KINDS) {
      expect(t(`kind.${kind}`)).toBeTruthy();
    }
  });

  test("EN kind labels are distinct human-readable strings", () => {
    const t = useTranslations("en");
    const labels = ALL_KINDS.map((k) => t(`kind.${k}`));
    expect(new Set(labels).size).toBe(ALL_KINDS.length);
  });
});

describe("pairings page translation keys", () => {
  test("pairings page keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("page.pairings.title")).toBeTruthy();
    expect(t("page.pairings.tagline")).toBeTruthy();
    expect(t("page.pairings.description")).toBeTruthy();
    expect(t("page.pairings.recentlyAdded")).toBeTruthy();
  });

  test("pairings page keys present in DE", () => {
    const t = useTranslations("de");
    expect(t("page.pairings.title")).toBeTruthy();
    expect(t("page.pairings.tagline")).toBeTruthy();
    expect(t("page.pairings.description")).toBeTruthy();
    expect(t("page.pairings.recentlyAdded")).toBeTruthy();
  });

  test("new filter keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("filter.region")).toBeTruthy();
    expect(t("filter.flavorProfile")).toBeTruthy();
  });

  test("new filter keys present in DE", () => {
    const t = useTranslations("de");
    expect(t("filter.region")).toBeTruthy();
    expect(t("filter.flavorProfile")).toBeTruthy();
  });
});
