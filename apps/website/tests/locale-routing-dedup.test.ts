import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES = join(WEBSITE_ROOT, "src", "pages");
const COMPONENTS = join(WEBSITE_ROOT, "src", "components");

describe("Locale routing dedup: shared page components exist", () => {
  test("components/pages/IngredientSlugPage.astro exists", async () => {
    await expect(stat(join(COMPONENTS, "pages", "IngredientSlugPage.astro"))).resolves.toBeTruthy();
  });

  test("components/pages/RecipeSlugPage.astro exists", async () => {
    await expect(stat(join(COMPONENTS, "pages", "RecipeSlugPage.astro"))).resolves.toBeTruthy();
  });

  test("components/pages/MixtureSlugPage.astro exists", async () => {
    await expect(stat(join(COMPONENTS, "pages", "MixtureSlugPage.astro"))).resolves.toBeTruthy();
  });

  test("components/pages/HomePage.astro exists", async () => {
    await expect(stat(join(COMPONENTS, "pages", "HomePage.astro"))).resolves.toBeTruthy();
  });
});

describe("Locale routing dedup: shared components use Astro.currentLocale", () => {
  const sharedComponents = [
    "pages/IngredientSlugPage.astro",
    "pages/RecipeSlugPage.astro",
    "pages/MixtureSlugPage.astro",
    "pages/HomePage.astro",
  ];

  for (const component of sharedComponents) {
    test(`${component} uses Astro.currentLocale for locale detection`, async () => {
      const src = await readFile(join(COMPONENTS, component), "utf-8");
      expect(src).toContain("Astro.currentLocale");
    });

    test(`${component} does not hardcode locale as string literal`, async () => {
      const src = await readFile(join(COMPONENTS, component), "utf-8");
      expect(src).not.toMatch(/const locale = "de"/);
      expect(src).not.toMatch(/const locale = "en"/);
    });
  }
});

describe("Locale routing dedup: de/ pages are thin wrappers", () => {
  const deDetailPages = [
    "de/ingredients/[slug].astro",
    "de/recipes/[slug].astro",
    "de/mixtures/[slug].astro",
  ];

  for (const page of deDetailPages) {
    test(`${page} imports from components/pages/`, async () => {
      const content = await readFile(join(PAGES, page), "utf-8");
      expect(content).toMatch(/import\s+\w+\s+from\s+["'].*components\/pages\//);
    });

    test(`${page} passes correct locale to resolvePublished in getStaticPaths`, async () => {
      const content = await readFile(join(PAGES, page), "utf-8");
      expect(content).toContain('"de"');
    });

    test(`${page} does not call useTranslations (rendering delegated to shared component)`, async () => {
      const content = await readFile(join(PAGES, page), "utf-8");
      expect(content).not.toContain("useTranslations(");
    });
  }

  test("de/index.astro imports from components/pages/", async () => {
    const src = await readFile(join(PAGES, "de", "index.astro"), "utf-8");
    expect(src).toMatch(/import\s+\w+\s+from\s+["'].*components\/pages\//);
  });

  test("de/index.astro does not call useTranslations (rendering delegated to shared component)", async () => {
    const src = await readFile(join(PAGES, "de", "index.astro"), "utf-8");
    expect(src).not.toContain("useTranslations(");
  });
});

describe("Locale routing dedup: shared detail components wire hreflang and fallback banner", () => {
  test("IngredientSlugPage.astro has hreflangTags and TranslationFallbackBanner", async () => {
    const src = await readFile(join(COMPONENTS, "pages", "IngredientSlugPage.astro"), "utf-8");
    expect(src).toContain("hreflangTags");
    expect(src).toContain("TranslationFallbackBanner");
  });

  test("RecipeSlugPage.astro has hreflangTags and TranslationFallbackBanner", async () => {
    const src = await readFile(join(COMPONENTS, "pages", "RecipeSlugPage.astro"), "utf-8");
    expect(src).toContain("hreflangTags");
    expect(src).toContain("TranslationFallbackBanner");
  });

  test("MixtureSlugPage.astro has hreflangTags and TranslationFallbackBanner", async () => {
    const src = await readFile(join(COMPONENTS, "pages", "MixtureSlugPage.astro"), "utf-8");
    expect(src).toContain("hreflangTags");
    expect(src).toContain("TranslationFallbackBanner");
  });
});
