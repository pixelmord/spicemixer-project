import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { parseRecipe } from "../src/parse.ts";
import { recipeSchema } from "../src/schema.ts";
import { IngestError } from "../src/errors.ts";

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf-8");
}

describe("parseRecipe integration", () => {
  test("HowToSection fixture — flattens sections into steps", () => {
    const html = fixture("howto-section.html");
    const result = parseRecipe(html, "https://example-food.com/recipes/pasta-al-pomodoro");

    expect(result.recipe.name).toBe("Pasta al Pomodoro");
    expect(result.recipe.recipeIngredient).toHaveLength(6);

    // All sections should be flattened to HowToStep objects
    const instructions = result.recipe.recipeInstructions as Array<{
      "@type": string;
      text: string;
    }>;
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.every((s) => s["@type"] === "HowToStep")).toBe(true);

    // Zod validation passes
    expect(recipeSchema.safeParse(result.recipe).success).toBe(true);
  });

  test("@graph with author @id ref fixture — resolves author", () => {
    const html = fixture("graph-with-author-ref.html");
    const result = parseRecipe(html, "https://example-pastry.com/recipes/lemon-tart");

    expect(result.recipe.name).toBe("Lemon Tart");

    const author = result.recipe.author as { "@type": string; name: string };
    expect(author).toBeDefined();
    expect(author.name).toBe("Ana Souza");

    // Multi-image normalized to array
    expect(Array.isArray(result.recipe.image)).toBe(true);

    // suitableForDiet — schema.org prefix stripped
    expect(result.recipe.suitableForDiet).toContain("VegetarianDiet");

    // Nutrition present
    expect(result.recipe.nutrition).toBeDefined();
    expect(result.recipe.nutrition?.calories).toBe("320 kcal");

    expect(recipeSchema.safeParse(result.recipe).success).toBe(true);
  });

  test("PropertyValue ingredients fixture — converts to strings", () => {
    const html = fixture("property-value-ingredients.html");
    const result = parseRecipe(html, "https://example-spices.com/blends/garam-masala");

    expect(result.recipe.name).toBe("Garam Masala");
    expect(result.recipe.recipeIngredient).toHaveLength(6);
    // PropertyValue entries become "value unitText name" strings
    expect(result.recipe.recipeIngredient[0]).toBe("2 tbsp coriander seeds");
    // Plain string entries pass through
    expect(result.recipe.recipeIngredient[4]).toBe("1 cinnamon stick");

    // QuantitativeValue yield
    expect(result.recipe.recipeYield).toBe("50 g");

    expect(recipeSchema.safeParse(result.recipe).success).toBe(true);
  });

  test("throws NO_JSONLD for html without ld+json", () => {
    expect(() =>
      parseRecipe("<html><body>No scripts here.</body></html>", "https://example.com"),
    ).toThrow(IngestError);
  });

  test("throws NO_RECIPE when ld+json contains no Recipe", () => {
    const html = `<script type="application/ld+json">{"@type":"WebPage","name":"Home"}</script>`;
    expect(() => parseRecipe(html, "https://example.com")).toThrow(IngestError);
  });
});
