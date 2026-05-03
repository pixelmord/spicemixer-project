import { describe, expect, test } from "vite-plus/test";
import { useTranslations } from "../../src/i18n/translations.ts";

describe("two-tier nav translation keys", () => {
  test("content-tier keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("nav.mixtures" as Parameters<typeof t>[0])).toBe("Mixtures");
    expect(t("nav.pairings" as Parameters<typeof t>[0])).toBe("Pairings");
    expect(t("nav.ingredients")).toBe("Ingredients");
    expect(t("nav.recipes")).toBe("Recipes");
  });

  test("lens-tier keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("nav.search" as Parameters<typeof t>[0])).toBe("Search");
    expect(t("nav.cookMode" as Parameters<typeof t>[0])).toBe("Cook Mode");
    expect(t("nav.worldmap" as Parameters<typeof t>[0])).toBe("Worldmap");
  });

  test("section header keys present in EN", () => {
    const t = useTranslations("en");
    expect(t("nav.sectionContent" as Parameters<typeof t>[0])).toBe("Collections");
    expect(t("nav.sectionLens" as Parameters<typeof t>[0])).toBe("Explore");
  });

  test("DE has translations for all new nav keys", () => {
    const t = useTranslations("de");
    const cast = (k: string) => t(k as Parameters<typeof t>[0]);
    expect(cast("nav.mixtures")).toBeTruthy();
    expect(cast("nav.pairings")).toBeTruthy();
    expect(cast("nav.search")).toBeTruthy();
    expect(cast("nav.cookMode")).toBeTruthy();
    expect(cast("nav.worldmap")).toBeTruthy();
    expect(cast("nav.sectionContent")).toBeTruthy();
    expect(cast("nav.sectionLens")).toBeTruthy();
  });

  test("open/close menu keys present in both locales", () => {
    const en = useTranslations("en");
    const de = useTranslations("de");
    const cast = (t: ReturnType<typeof useTranslations>, k: string) =>
      t(k as Parameters<typeof t>[0]);
    expect(cast(en, "nav.openMenu")).toBeTruthy();
    expect(cast(en, "nav.closeMenu")).toBeTruthy();
    expect(cast(de, "nav.openMenu")).toBeTruthy();
    expect(cast(de, "nav.closeMenu")).toBeTruthy();
  });
});
