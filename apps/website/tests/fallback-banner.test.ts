import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components");
const PAGES = join(WEBSITE_ROOT, "src", "pages");

describe("TranslationFallbackBanner component", () => {
  let bannerSrc: string;
  beforeAll(async () => {
    bannerSrc = await readFile(join(COMPONENTS, "TranslationFallbackBanner.astro"), "utf-8");
  });

  test("accepts requestedLocale and canonicalLocale props", () => {
    expect(bannerSrc).toContain("requestedLocale");
    expect(bannerSrc).toContain("canonicalLocale");
  });

  test("uses useTranslations with requestedLocale for localization", () => {
    expect(bannerSrc).toContain("useTranslations");
    expect(bannerSrc).toContain("requestedLocale");
  });

  test("renders locale.fallback translation key", () => {
    expect(bannerSrc).toContain("locale.fallback");
  });

  test("interpolates canonical and requested locale placeholders", () => {
    expect(bannerSrc).toContain("{canonical}");
    expect(bannerSrc).toContain("{requested}");
  });
});

describe("Fallback banner wired into ingredient detail pages", () => {
  let enSrc: string;
  let deSrc: string;

  beforeAll(async () => {
    [enSrc, deSrc] = await Promise.all([
      readFile(join(PAGES, "ingredients", "[slug].astro"), "utf-8"),
      readFile(join(PAGES, "de", "ingredients", "[slug].astro"), "utf-8"),
    ]);
  });

  test("EN ingredient page imports TranslationFallbackBanner", () => {
    expect(enSrc).toContain("TranslationFallbackBanner");
  });

  test("EN ingredient page imports resolvePublished", () => {
    expect(enSrc).toContain("resolvePublished");
  });

  test("EN ingredient page conditionally renders banner on isFallback", () => {
    expect(enSrc).toContain("isFallback");
    expect(enSrc).toContain("TranslationFallbackBanner");
  });

  test("DE ingredient page imports TranslationFallbackBanner", () => {
    expect(deSrc).toContain("TranslationFallbackBanner");
  });

  test("DE ingredient page imports resolvePublished", () => {
    expect(deSrc).toContain("resolvePublished");
  });

  test("DE page getStaticPaths passes 'de' locale to resolvePublished", () => {
    expect(deSrc).toContain(`resolvePublished("ingredients", slug, "de")`);
  });

  test("EN page getStaticPaths passes 'en' locale to resolvePublished", () => {
    expect(enSrc).toContain(`resolvePublished("ingredients", slug, "en")`);
  });
});

describe("hreflang tags wired into detail pages", () => {
  test("ingredient pages import hreflangTags", async () => {
    const [enSrc, deSrc] = await Promise.all([
      readFile(join(PAGES, "ingredients", "[slug].astro"), "utf-8"),
      readFile(join(PAGES, "de", "ingredients", "[slug].astro"), "utf-8"),
    ]);
    expect(enSrc).toContain("hreflangTags");
    expect(deSrc).toContain("hreflangTags");
  });

  test("ingredient pages render link rel=alternate tags", async () => {
    const [enSrc, deSrc] = await Promise.all([
      readFile(join(PAGES, "ingredients", "[slug].astro"), "utf-8"),
      readFile(join(PAGES, "de", "ingredients", "[slug].astro"), "utf-8"),
    ]);
    expect(enSrc).toContain('rel="alternate"');
    expect(deSrc).toContain('rel="alternate"');
  });

  test("recipe pages import hreflangTags", async () => {
    const [enSrc, deSrc] = await Promise.all([
      readFile(join(PAGES, "recipes", "[slug].astro"), "utf-8"),
      readFile(join(PAGES, "de", "recipes", "[slug].astro"), "utf-8"),
    ]);
    expect(enSrc).toContain("hreflangTags");
    expect(deSrc).toContain("hreflangTags");
  });

  test("mixture pages import hreflangTags", async () => {
    const [enSrc, deSrc] = await Promise.all([
      readFile(join(PAGES, "mixtures", "[slug].astro"), "utf-8"),
      readFile(join(PAGES, "de", "mixtures", "[slug].astro"), "utf-8"),
    ]);
    expect(enSrc).toContain("hreflangTags");
    expect(deSrc).toContain("hreflangTags");
  });
});
