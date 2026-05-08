import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES = join(ROOT, "src", "pages");
const COMPONENTS = join(ROOT, "src", "components");

describe("Pagefind: mixture detail template (shared MixtureSlugPage component)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "pages", "MixtureSlugPage.astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-filter attrs", () => {
    expect(src).toContain("data-pagefind-filter");
  });
});

describe("Pagefind: ingredient detail template (shared IngredientSlugPage component)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "pages", "IngredientSlugPage.astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-filter attrs", () => {
    expect(src).toContain("data-pagefind-filter");
  });
});

describe("Pagefind: recipe detail template (shared RecipeSlugPage component)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "pages", "RecipeSlugPage.astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-filter attrs", () => {
    expect(src).toContain("data-pagefind-filter");
  });
});

describe("Pagefind: pairing detail template (shared PairingSlugPage component)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "pages", "PairingSlugPage.astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-filter attrs", () => {
    expect(src).toContain("data-pagefind-filter");
  });
});

describe("Pagefind: SiteNav search link", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(ROOT, "src", "components", "SiteNav.astro"), "utf-8");
  });

  test("search link points to /search/", () => {
    expect(src).toContain("/search/");
  });

  test("search is a real anchor element, not disabled span", () => {
    // searchHref variable carries the /search/ path; the render branch uses <a href={href}>
    expect(src).toContain("/search/");
    expect(src).toContain("href={href}");
  });
});

describe("Pagefind: search pages exist", () => {
  let sharedSrc: string;
  beforeAll(async () => {
    sharedSrc = await readFile(join(COMPONENTS, "pages", "SearchPage.astro"), "utf-8");
  });

  test("EN search page exists and has Pagefind UI", async () => {
    const src = await readFile(join(PAGES, "search.astro"), "utf-8");
    expect(src).toContain("SearchPage");
    expect(sharedSrc).toContain("pagefind");
  });

  test("DE search page exists and loads DE index", async () => {
    const src = await readFile(join(PAGES, "de", "search.astro"), "utf-8");
    expect(src).toContain("SearchPage");
    expect(sharedSrc).toContain("pagefind");
    expect(sharedSrc).toContain("currentLocale");
  });
});
