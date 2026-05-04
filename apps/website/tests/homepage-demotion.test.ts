import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES = join(WEBSITE_ROOT, "src", "pages");
const COMPONENTS = join(WEBSITE_ROOT, "src", "components");

const RECIPE_LINK_PATTERN = /href=["'`][^"'`]*\/recipes\/[^"'`]*["'`]/;

describe("Recipe demotion: homepage must not link to /recipes/", () => {
  let homeSrc: string;
  let homeDeSrc: string;
  let homeComponentSrc: string;

  beforeAll(async () => {
    [homeSrc, homeDeSrc, homeComponentSrc] = await Promise.all([
      readFile(join(PAGES, "index.astro"), "utf-8"),
      readFile(join(PAGES, "de", "index.astro"), "utf-8"),
      readFile(join(COMPONENTS, "pages", "HomePage.astro"), "utf-8"),
    ]);
  });

  test("EN homepage contains no <a href> pointing to /recipes/", () => {
    expect(RECIPE_LINK_PATTERN.test(homeSrc)).toBe(false);
  });

  test("DE homepage contains no <a href> pointing to /recipes/", () => {
    expect(RECIPE_LINK_PATTERN.test(homeDeSrc)).toBe(false);
  });

  test("shared HomePage component contains no <a href> pointing to /recipes/", () => {
    expect(RECIPE_LINK_PATTERN.test(homeComponentSrc)).toBe(false);
  });

  test("shared HomePage component imports RecentlyAddedFeed (not a raw recipe list)", () => {
    expect(homeComponentSrc).toContain("RecentlyAddedFeed");
  });

  test("shared HomePage component uses excludeRecipes: true", () => {
    expect(homeComponentSrc).toContain("excludeRecipes: true");
  });
});

describe("Recipe demotion: pairings index must not link to /recipes/", () => {
  let pairingsSrc: string;

  beforeAll(async () => {
    pairingsSrc = await readFile(join(PAGES, "pairings", "index.astro"), "utf-8");
  });

  test("/pairings/ contains no <a href> pointing to /recipes/", () => {
    expect(RECIPE_LINK_PATTERN.test(pairingsSrc)).toBe(false);
  });
});

describe("Recipe demotion: recently-added helper enforces excludeRecipes contract", () => {
  test("recentlyAdded with excludeRecipes:true strips recipe entries", async () => {
    const { recentlyAdded } = await import("../src/lib/recently-added.ts");
    const entries = [
      { type: "mixture" as const, slug: "harissa", name: "Harissa", href: "/mixtures/harissa/" },
      { type: "recipe" as const, slug: "miso", name: "Miso", href: "/recipes/miso/" },
    ];
    const result = recentlyAdded(entries, { excludeRecipes: true });
    expect(result.every((e) => e.type !== "recipe")).toBe(true);
    expect(result).toHaveLength(1);
  });
});
