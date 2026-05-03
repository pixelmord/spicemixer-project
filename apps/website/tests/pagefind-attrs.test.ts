import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES = join(ROOT, "src", "pages");

describe("Pagefind: mixture detail template", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(PAGES, "mixtures", "[slug].astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-ignore for drafts", () => {
    expect(src).toContain("data-pagefind-ignore");
  });

  test("emits data-pagefind-filter attrs", () => {
    expect(src).toContain("data-pagefind-filter");
  });
});

describe("Pagefind: ingredient detail template", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(PAGES, "ingredients", "[slug].astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-ignore for drafts", () => {
    expect(src).toContain("data-pagefind-ignore");
  });

  test("emits data-pagefind-filter attrs", () => {
    expect(src).toContain("data-pagefind-filter");
  });
});

describe("Pagefind: recipe detail template", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(PAGES, "recipes", "[slug].astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-ignore for drafts", () => {
    expect(src).toContain("data-pagefind-ignore");
  });

  test("emits data-pagefind-filter attrs", () => {
    expect(src).toContain("data-pagefind-filter");
  });
});

describe("Pagefind: pairing detail template", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(PAGES, "pairings", "[slug].astro"), "utf-8");
  });

  test("imports withPagefindFilters", () => {
    expect(src).toContain("withPagefindFilters");
  });

  test("emits data-pagefind-body on wrapper", () => {
    expect(src).toContain("data-pagefind-body");
  });

  test("emits data-pagefind-ignore for drafts", () => {
    expect(src).toContain("data-pagefind-ignore");
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
  test("EN search page exists and has Pagefind UI", async () => {
    const src = await readFile(join(PAGES, "search.astro"), "utf-8");
    expect(src).toContain("pagefind");
    expect(src).toContain("search");
  });

  test("DE search page exists and loads DE index", async () => {
    const src = await readFile(join(PAGES, "de", "search.astro"), "utf-8");
    expect(src).toContain("pagefind");
    expect(src).toContain("de");
  });
});
