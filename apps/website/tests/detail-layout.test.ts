import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components");

describe("DetailLayout: slot ordering enforced by component shape", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "DetailLayout.astro"), "utf-8");
  });

  test("defines all five named slots", () => {
    expect(src).toContain('name="hero"');
    expect(src).toContain('name="encyclopedia"');
    expect(src).toContain('name="recipe"');
    expect(src).toContain('name="relations"');
    expect(src).toContain('name="liability"');
  });

  test("slot order is hero → encyclopedia → recipe → relations → liability", () => {
    const heroIdx = src.indexOf('name="hero"');
    const encyclopediaIdx = src.indexOf('name="encyclopedia"');
    const recipeIdx = src.indexOf('name="recipe"');
    const relationsIdx = src.indexOf('name="relations"');
    const liabilityIdx = src.indexOf('name="liability"');

    expect(heroIdx).toBeGreaterThan(-1);
    expect(encyclopediaIdx).toBeGreaterThan(heroIdx);
    expect(recipeIdx).toBeGreaterThan(encyclopediaIdx);
    expect(relationsIdx).toBeGreaterThan(recipeIdx);
    expect(liabilityIdx).toBeGreaterThan(relationsIdx);
  });
});

describe("DetailLayout: mixture detail page contract (shared MixtureSlugPage component)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "pages", "MixtureSlugPage.astro"), "utf-8");
  });

  test("imports DetailLayout", () => {
    expect(src).toContain("DetailLayout");
  });

  test("uses hero, recipe, and relations slots", () => {
    expect(src).toContain('slot="hero"');
    expect(src).toContain('slot="recipe"');
    expect(src).toContain('slot="relations"');
  });

  test("hero slot contains a #recipe anchor for Jump to recipe", () => {
    expect(src).toContain("#recipe");
  });

  test("recipe slot has id='recipe' anchor target", () => {
    expect(src).toContain('id="recipe"');
  });

  test("recipe slot emits JSON-LD", () => {
    expect(src).toContain("application/ld+json");
  });
});

describe("DetailLayout: ingredient detail page contract (shared IngredientSlugPage component)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "pages", "IngredientSlugPage.astro"), "utf-8");
  });

  test("imports DetailLayout", () => {
    expect(src).toContain("DetailLayout");
  });

  test("uses hero, encyclopedia, and relations slots", () => {
    expect(src).toContain('slot="hero"');
    expect(src).toContain('slot="encyclopedia"');
    expect(src).toContain('slot="relations"');
  });

  test("does not use recipe slot", () => {
    expect(src).not.toContain('slot="recipe"');
  });

  test("uses liability slot gated by hasLiabilityScope", () => {
    expect(src).toContain("hasLiabilityScope");
    expect(src).toContain('slot="liability"');
  });
});

describe("DetailLayout: recipe detail page contract (shared RecipeSlugPage component)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "pages", "RecipeSlugPage.astro"), "utf-8");
  });

  test("imports DetailLayout", () => {
    expect(src).toContain("DetailLayout");
  });

  test("uses hero, encyclopedia, recipe, and relations slots", () => {
    expect(src).toContain('slot="hero"');
    expect(src).toContain('slot="encyclopedia"');
    expect(src).toContain('slot="recipe"');
    expect(src).toContain('slot="relations"');
  });

  test("encyclopedia slot contains 'demonstrates' cross-links header", () => {
    expect(src).toContain("demonstrates");
  });

  test("recipe slot emits JSON-LD", () => {
    expect(src).toContain("application/ld+json");
  });
});
