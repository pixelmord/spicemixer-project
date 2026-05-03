import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

// Integration contract: admin new-entity dispatch routing (PRD #1 / issue #13).
// Verifies that:
//   Ingredient → IngredientForm  (NewIngredientPage)
//   Mixture    → RecipeForm with kind dropdown visible  (collection="mixtures")
//   Recipe     → RecipeForm without kind dropdown       (collection="recipes")

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");
const PAGES = join(WEBSITE_ROOT, "src", "pages", "admin");

describe("admin-dispatch: RecipeForm kind dropdown gated on mixtures collection", () => {
  test("RecipeForm imports MIXTURE_KINDS and uses it as dropdown options", async () => {
    const src = await readFile(join(COMPONENTS, "RecipeForm.tsx"), "utf-8");
    expect(src).toContain('from "@/lib/mixture-schema.ts"');
    expect(src).toContain("MIXTURE_KINDS");
    expect(src).toContain("MIXTURE_KINDS.map");
  });

  test("kind dropdown is rendered only when collection === 'mixtures'", async () => {
    const src = await readFile(join(COMPONENTS, "RecipeForm.tsx"), "utf-8");
    expect(src).toContain('collection === "mixtures"');
    const kindDropdownIdx = src.indexOf("mixture-kind-select");
    expect(kindDropdownIdx, "data-testid=mixture-kind-select not found").toBeGreaterThan(-1);
    const collectionCheckIdx = src.lastIndexOf('collection === "mixtures"', kindDropdownIdx);
    expect(
      collectionCheckIdx,
      "kind dropdown must be inside a collection === 'mixtures' branch",
    ).toBeGreaterThan(-1);
  });

  test("kind field is required — form rejects save when collection=mixtures and kind is empty", async () => {
    const src = await readFile(join(COMPONENTS, "RecipeForm.tsx"), "utf-8");
    expect(src).toContain('"Kind is required for mixtures"');
  });

  test("RecipeForm imports and calls validateSlug for mixtures", async () => {
    const src = await readFile(join(COMPONENTS, "RecipeForm.tsx"), "utf-8");
    expect(src).toContain('from "@/lib/slug-validator.ts"');
    expect(src).toContain("validateSlug(");
  });
});

describe("admin-dispatch: QuickCreateDialog 3-way EntityKind", () => {
  test("EntityKind includes 'mixture' and excludes legacy 'spicemix'/'sauce'", async () => {
    const src = await readFile(join(COMPONENTS, "QuickCreateDialog.tsx"), "utf-8");
    expect(src).toContain('"mixture"');
    expect(src).not.toContain('"spicemix"');
    expect(src).not.toContain('"sauce"');
  });

  test("mixture kind routes to the mixtures collection", async () => {
    const src = await readFile(join(COMPONENTS, "QuickCreateDialog.tsx"), "utf-8");
    expect(src).toContain('"mixtures"');
  });
});

describe("admin-dispatch: Astro pages pass correct collection prop", () => {
  test("mixtures/new.astro passes collection='mixtures' to NewRecipePage", async () => {
    const src = await readFile(join(PAGES, "mixtures", "new.astro"), "utf-8");
    expect(src).toContain('collection="mixtures"');
  });

  test("recipes/new.astro passes collection='recipes' to NewRecipePage", async () => {
    const src = await readFile(join(PAGES, "recipes", "new.astro"), "utf-8");
    expect(src).toContain('collection="recipes"');
  });

  test("ingredients/new.astro uses NewIngredientPage (not RecipeForm)", async () => {
    const src = await readFile(join(PAGES, "ingredients", "new.astro"), "utf-8");
    expect(src).toContain("NewIngredientPage");
    expect(src).not.toContain("RecipeForm");
  });
});
