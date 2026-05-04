import { describe, expect, test } from "vite-plus/test";
import {
  scoreRecipe,
  scorePairing,
  RECIPE_REQUIRED,
  RECIPE_RECOMMENDED,
  PAIRING_REQUIRED,
  PAIRING_RECOMMENDED,
} from "../src/index.ts";

const FULL_RECIPE_REQUIRED = {
  name: "Miso Ramen",
  recipeIngredient: ["miso paste", "noodles", "broth"],
  recipeInstructions: ["Boil broth", "Add miso", "Serve with noodles"],
};

const FULL_RECIPE_RECOMMENDED = {
  description: "A rich Japanese noodle soup",
  image: "https://example.com/ramen.jpg",
  author: { name: "Chef Tanaka" },
  recipeYield: "2 servings",
  prepTime: "PT15M",
  cookTime: "PT30M",
  totalTime: "PT45M",
  recipeCategory: "Main",
  recipeCuisine: "Japanese",
  keywords: ["ramen", "miso"],
  datePublished: "2024-01-01",
};

const FULL_META = { ingredientLinks: [{ pattern: "miso", slug: "miso-paste" }] };

describe("RECIPE_REQUIRED", () => {
  test("contains name, recipeIngredient, recipeInstructions", () => {
    expect(RECIPE_REQUIRED).toContain("name");
    expect(RECIPE_REQUIRED).toContain("recipeIngredient");
    expect(RECIPE_REQUIRED).toContain("recipeInstructions");
    expect(RECIPE_REQUIRED).toHaveLength(3);
  });
});

describe("RECIPE_RECOMMENDED", () => {
  test("contains all expected fields", () => {
    expect(RECIPE_RECOMMENDED).toContain("description");
    expect(RECIPE_RECOMMENDED).toContain("image");
    expect(RECIPE_RECOMMENDED).toContain("author");
    expect(RECIPE_RECOMMENDED).toContain("recipeYield");
    expect(RECIPE_RECOMMENDED).toContain("keywords");
    expect(RECIPE_RECOMMENDED).toContain("datePublished");
  });
});

describe("scoreRecipe — required fields", () => {
  test.each([
    [{ recipeIngredient: ["salt"], recipeInstructions: ["Cook"] }, "name"],
    [{ name: "Ramen", recipeInstructions: ["Cook"] }, "recipeIngredient"],
    [{ name: "Ramen", recipeIngredient: ["salt"] }, "recipeInstructions"],
    [{ name: "Ramen", recipeIngredient: [], recipeInstructions: ["Cook"] }, "recipeIngredient"],
  ])("missing required → score 0, red", (recipe, missingField) => {
    const result = scoreRecipe(recipe);
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain(missingField);
  });
});

describe("scoreRecipe — recommended fields and meta", () => {
  test("all required, no recommended, no meta → score 0, red, all recommended missing", () => {
    const result = scoreRecipe({ ...FULL_RECIPE_REQUIRED });
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("meta.ingredientLinks");
    for (const f of RECIPE_RECOMMENDED) {
      expect(result.missing).toContain(f);
    }
  });

  test("all required + all recommended + meta → score 100, green", () => {
    const result = scoreRecipe({ ...FULL_RECIPE_REQUIRED, ...FULL_RECIPE_RECOMMENDED }, FULL_META);
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });

  test("ingredientLinks present in meta counts toward score", () => {
    const withLinks = scoreRecipe({ ...FULL_RECIPE_REQUIRED }, FULL_META);
    const withoutLinks = scoreRecipe({ ...FULL_RECIPE_REQUIRED });
    expect(withLinks.score).toBeGreaterThan(withoutLinks.score);
    expect(withoutLinks.missing).toContain("meta.ingredientLinks");
    expect(withLinks.missing).not.toContain("meta.ingredientLinks");
  });

  test("empty ingredientLinks array treated as missing", () => {
    const result = scoreRecipe({ ...FULL_RECIPE_REQUIRED }, { ingredientLinks: [] });
    expect(result.missing).toContain("meta.ingredientLinks");
  });

  test("partial recommended → amber score", () => {
    const result = scoreRecipe({
      ...FULL_RECIPE_REQUIRED,
      description: "Tasty",
      image: "https://example.com/img.jpg",
      author: { name: "Chef" },
      recipeYield: "2",
      prepTime: "PT10M",
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.color).toBe("amber");
  });

  test("meta defaults to empty object when omitted", () => {
    const withMeta = scoreRecipe({ ...FULL_RECIPE_REQUIRED }, {});
    const withoutMeta = scoreRecipe({ ...FULL_RECIPE_REQUIRED });
    expect(withMeta.score).toBe(withoutMeta.score);
  });
});

describe("PAIRING_REQUIRED / PAIRING_RECOMMENDED", () => {
  test("required is descriptions, recommended is en and de", () => {
    expect(PAIRING_REQUIRED).toContain("descriptions");
    expect(PAIRING_RECOMMENDED).toContain("descriptions.en");
    expect(PAIRING_RECOMMENDED).toContain("descriptions.de");
  });
});

describe("scorePairing — missing descriptions", () => {
  test("empty pairing → score 0, red", () => {
    const result = scorePairing({});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("descriptions");
  });

  test("null descriptions field → score 0, red", () => {
    const result = scorePairing({ descriptions: {} });
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
  });
});

describe("scorePairing — legacy description field", () => {
  test("legacy description field treated as en", () => {
    const result = scorePairing({ description: "Old format" });
    expect(result.score).toBeGreaterThan(0);
    expect(result.missing).not.toContain("descriptions");
  });

  test("legacy description + de → score 100, green", () => {
    const result = scorePairing({ description: "Old format", descriptions: { de: "Auf Deutsch" } });
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
  });
});

describe("scorePairing — locale handling", () => {
  test.each([
    [{ descriptions: { en: "Good pair" } }, "en", 50],
    [{ descriptions: { en: "Good pair", de: "Gut zusammen" } }, "en", 100],
    [{ descriptions: { en: "Good pair", de: "Gut zusammen" } }, "de", 100],
  ])("locale '%s' → correct score", (pairing, locale, expectedScore) => {
    const result = scorePairing(pairing, locale);
    expect(result.score).toBe(expectedScore);
  });

  test("requested locale missing is prepended to missing list", () => {
    const result = scorePairing({ descriptions: { en: "English" } }, "de");
    expect(result.missing[0]).toBe("description.de");
  });

  test("en-only → score 50, amber", () => {
    const result = scorePairing({ descriptions: { en: "English only" } });
    expect(result.score).toBe(50);
    expect(result.color).toBe("amber");
  });

  test("both en and de → score 100, green", () => {
    const result = scorePairing({ descriptions: { en: "English", de: "Deutsch" } });
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });
});
