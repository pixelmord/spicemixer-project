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
  let enPageSrc: string;
  let dePageSrc: string;
  let sharedComponentSrc: string;

  beforeAll(async () => {
    [enPageSrc, dePageSrc, sharedComponentSrc] = await Promise.all([
      readFile(join(PAGES, "ingredients", "[slug].astro"), "utf-8"),
      readFile(join(PAGES, "de", "ingredients", "[slug].astro"), "utf-8"),
      readFile(join(COMPONENTS, "pages", "IngredientSlugPage.astro"), "utf-8"),
    ]);
  });

  test("shared IngredientSlugPage component imports TranslationFallbackBanner", () => {
    expect(sharedComponentSrc).toContain("TranslationFallbackBanner");
  });

  test("shared IngredientSlugPage component imports resolvePublished (via route props)", () => {
    expect(sharedComponentSrc).toContain("isFallback");
    expect(sharedComponentSrc).toContain("canonicalLocale");
  });

  test("shared IngredientSlugPage component conditionally renders banner on isFallback", () => {
    expect(sharedComponentSrc).toContain("isFallback");
    expect(sharedComponentSrc).toContain("TranslationFallbackBanner");
  });

  test("EN ingredient page imports resolvePublished", () => {
    expect(enPageSrc).toContain("resolvePublished");
  });

  test("DE ingredient page imports resolvePublished", () => {
    expect(dePageSrc).toContain("resolvePublished");
  });

  test("DE page getStaticPaths passes 'de' locale to resolvePublished", () => {
    expect(dePageSrc).toContain(`resolvePublished("ingredients", slug, "de")`);
  });

  test("EN page getStaticPaths passes 'en' locale to resolvePublished", () => {
    expect(enPageSrc).toContain(`resolvePublished("ingredients", slug, "en")`);
  });
});

describe("hreflang tags wired into detail pages", () => {
  test("IngredientSlugPage shared component imports hreflangTags", async () => {
    const src = await readFile(join(COMPONENTS, "pages", "IngredientSlugPage.astro"), "utf-8");
    expect(src).toContain("hreflangTags");
  });

  test("IngredientSlugPage shared component renders link rel=alternate tags", async () => {
    const src = await readFile(join(COMPONENTS, "pages", "IngredientSlugPage.astro"), "utf-8");
    expect(src).toContain('rel="alternate"');
  });

  test("RecipeSlugPage shared component imports hreflangTags", async () => {
    const src = await readFile(join(COMPONENTS, "pages", "RecipeSlugPage.astro"), "utf-8");
    expect(src).toContain("hreflangTags");
  });

  test("MixtureSlugPage shared component imports hreflangTags", async () => {
    const src = await readFile(join(COMPONENTS, "pages", "MixtureSlugPage.astro"), "utf-8");
    expect(src).toContain("hreflangTags");
  });
});
