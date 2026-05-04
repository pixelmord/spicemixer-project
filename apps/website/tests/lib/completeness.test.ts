import { describe, expect, test } from "vite-plus/test";
import {
  scoreIngredient,
  scoreRecipe,
  scorePairing,
  resolvePairingDescription,
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
  RECIPE_REQUIRED,
  RECIPE_RECOMMENDED,
} from "../../src/lib/completeness.ts";

const FULL_REQUIRED = { name: "Cardamom", category: "spice", summary: "A great spice" };
const FULL_RECOMMENDED = {
  description: "Very aromatic",
  botanicalName: "Elettaria cardamomum",
  family: "Zingiberaceae",
  origin: ["India"],
  parts: ["seed"],
  culinaryUse: "Used in chai and desserts",
  flavorProfile: ["warm"],
  images: ["https://example.com/img.jpg"],
};

describe("INGREDIENT_REQUIRED", () => {
  test("contains exactly name, category, summary", () => {
    expect(INGREDIENT_REQUIRED).toContain("name");
    expect(INGREDIENT_REQUIRED).toContain("category");
    expect(INGREDIENT_REQUIRED).toContain("summary");
    expect(INGREDIENT_REQUIRED).toHaveLength(3);
  });
});

describe("INGREDIENT_RECOMMENDED", () => {
  test("contains images[0] not images or image (singular)", () => {
    expect(INGREDIENT_RECOMMENDED).toContain("images[0]");
    expect(INGREDIENT_RECOMMENDED).not.toContain("images");
    expect(INGREDIENT_RECOMMENDED).not.toContain("image");
  });

  test("contains all taxonomy and content fields", () => {
    expect(INGREDIENT_RECOMMENDED).toContain("description");
    expect(INGREDIENT_RECOMMENDED).toContain("botanicalName");
    expect(INGREDIENT_RECOMMENDED).toContain("family");
    expect(INGREDIENT_RECOMMENDED).toContain("origin");
    expect(INGREDIENT_RECOMMENDED).toContain("parts");
    expect(INGREDIENT_RECOMMENDED).toContain("culinaryUse");
    expect(INGREDIENT_RECOMMENDED).toContain("flavorProfile");
  });
});

describe("scoreIngredient — required fields (table-driven)", () => {
  test.each([
    [{ category: "spice", summary: "A spice" }, "name"],
    [{ name: "Cardamom", summary: "A spice" }, "category"],
    [{ name: "Cardamom", category: "spice" }, "summary"],
  ])("missing required → score 0, red, missing contains %s", (ingredient, missingField) => {
    const result = scoreIngredient(ingredient);
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain(missingField);
  });

  test("empty string summary → score 0", () => {
    const result = scoreIngredient({ name: "Cardamom", category: "spice", summary: "" });
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("summary");
  });
});

describe("scoreIngredient — partial recommended (table-driven)", () => {
  test("all required, no recommended → score 0, red, all recommended in missing", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED });
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    for (const f of INGREDIENT_RECOMMENDED) {
      expect(result.missing).toContain(f);
    }
  });

  test.each([
    [
      { ...FULL_REQUIRED, description: "Aromatic", botanicalName: "Elettaria" },
      ["family", "origin", "parts", "culinaryUse", "flavorProfile", "images[0]"],
    ],
    [
      { ...FULL_REQUIRED, images: ["https://example.com/img.jpg"] },
      ["description", "botanicalName", "family", "origin", "parts", "culinaryUse", "flavorProfile"],
    ],
  ])("partial ingredient → correct missing list", (ingredient, expectedMissing) => {
    const result = scoreIngredient(ingredient);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    for (const m of expectedMissing) {
      expect(result.missing).toContain(m);
    }
  });

  test("3 of 8 recommended filled → amber (score >= 40)", () => {
    const result = scoreIngredient({
      ...FULL_REQUIRED,
      description: "Aromatic",
      botanicalName: "Elettaria",
      family: "Zingiberaceae",
      origin: ["India"],
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.color).toBe("amber");
  });
});

describe("scoreIngredient — images[0] handling", () => {
  test("empty images[] is treated as missing images[0]", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, images: [] });
    expect(result.missing).toContain("images[0]");
  });

  test("images[] with one URL counts as filled", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, images: ["https://example.com/img.jpg"] });
    expect(result.missing).not.toContain("images[0]");
  });

  test("absent images field treated as missing images[0]", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED });
    expect(result.missing).toContain("images[0]");
  });

  test("empty parts[] is treated as missing", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, parts: [] });
    expect(result.missing).toContain("parts");
  });
});

describe("scoreIngredient — full coverage", () => {
  test("all required + all recommended → score 100, green, no missing", () => {
    const result = scoreIngredient({ ...FULL_REQUIRED, ...FULL_RECOMMENDED });
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });
});

// ── RECIPE_REQUIRED / RECIPE_RECOMMENDED ──────────────────────────────────────

describe("RECIPE_REQUIRED", () => {
  test("contains name, recipeIngredient, recipeInstructions", () => {
    expect(RECIPE_REQUIRED).toContain("name");
    expect(RECIPE_REQUIRED).toContain("recipeIngredient");
    expect(RECIPE_REQUIRED).toContain("recipeInstructions");
    expect(RECIPE_REQUIRED).toHaveLength(3);
  });
});

describe("RECIPE_RECOMMENDED", () => {
  test("contains all time, metadata, and taxonomy fields", () => {
    for (const f of [
      "description",
      "image",
      "author",
      "recipeYield",
      "prepTime",
      "cookTime",
      "totalTime",
      "recipeCategory",
      "recipeCuisine",
      "keywords",
      "datePublished",
    ] as const) {
      expect(RECIPE_RECOMMENDED).toContain(f);
    }
  });
});

const BASE_RECIPE = {
  name: "Miso Ramen",
  recipeIngredient: ["miso paste", "noodles"],
  recipeInstructions: ["Boil and serve"],
};

const FULL_RECIPE_RECOMMENDED = {
  description: "Rich noodle soup",
  image: "https://example.com/img.jpg",
  author: { name: "Chef" },
  recipeYield: "2",
  prepTime: "PT10M",
  cookTime: "PT30M",
  totalTime: "PT40M",
  recipeCategory: "Main",
  recipeCuisine: "Japanese",
  keywords: ["ramen"],
  datePublished: "2024-01-01",
};

describe("scoreRecipe — required fields", () => {
  test.each([
    [{ recipeIngredient: ["salt"], recipeInstructions: ["Cook"] }, "name"],
    [{ name: "Ramen", recipeInstructions: ["Cook"] }, "recipeIngredient"],
    [{ name: "Ramen", recipeIngredient: [] }, "recipeIngredient"],
    [{ name: "Ramen", recipeIngredient: ["salt"] }, "recipeInstructions"],
  ])("missing required → score 0, red", (recipe, missingField) => {
    const result = scoreRecipe(recipe, {});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain(missingField);
  });
});

describe("scoreRecipe — recommended and meta", () => {
  test("all required only → score 0, all recommended missing", () => {
    const result = scoreRecipe(BASE_RECIPE, {});
    expect(result.score).toBe(0);
    expect(result.missing).toContain("meta.ingredientLinks");
    for (const f of RECIPE_RECOMMENDED) {
      expect(result.missing).toContain(f);
    }
  });

  test("all required + all recommended + meta links → score 100, green", () => {
    const result = scoreRecipe(
      { ...BASE_RECIPE, ...FULL_RECIPE_RECOMMENDED },
      { ingredientLinks: [{ pattern: "miso", slug: "miso-paste" }] },
    );
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });

  test("meta ingredientLinks count toward score", () => {
    const without = scoreRecipe(BASE_RECIPE, {});
    const with_ = scoreRecipe(BASE_RECIPE, { ingredientLinks: [{ pattern: "x", slug: "x" }] });
    expect(with_.score).toBeGreaterThan(without.score);
    expect(without.missing).toContain("meta.ingredientLinks");
    expect(with_.missing).not.toContain("meta.ingredientLinks");
  });

  test("empty ingredientLinks treated as missing", () => {
    const result = scoreRecipe(BASE_RECIPE, { ingredientLinks: [] });
    expect(result.missing).toContain("meta.ingredientLinks");
  });
});

// ── scorePairing ───────────────────────────────────────────────────────────────

describe("scorePairing — no descriptions", () => {
  test("empty object → score 0, red", () => {
    const result = scorePairing({}, "en");
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("descriptions");
  });

  test("descriptions:{} → score 0, red", () => {
    const result = scorePairing({ descriptions: {} }, "en");
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
  });
});

describe("scorePairing — locale and scoring", () => {
  test("en only → score 50, amber", () => {
    const result = scorePairing({ descriptions: { en: "Good pair" } }, "en");
    expect(result.score).toBe(50);
    expect(result.color).toBe("amber");
  });

  test("en + de → score 100, green, no missing", () => {
    const result = scorePairing({ descriptions: { en: "Good", de: "Gut" } }, "en");
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });

  test("locale missing is prepended to missing list", () => {
    const result = scorePairing({ descriptions: { en: "English" } }, "de");
    expect(result.missing[0]).toBe("description.de");
  });

  test("legacy description field treated as en", () => {
    const result = scorePairing({ description: "Old format" }, "en");
    expect(result.score).toBeGreaterThan(0);
    expect(result.missing).not.toContain("descriptions");
  });
});

// ── resolvePairingDescription ─────────────────────────────────────────────────

describe("resolvePairingDescription", () => {
  test("returns exact locale match, isFallback false", () => {
    const result = resolvePairingDescription(
      { descriptions: { en: "English", de: "Deutsch" } },
      "de",
    );
    expect(result.description).toBe("Deutsch");
    expect(result.locale).toBe("de");
    expect(result.isFallback).toBe(false);
  });

  test("falls back to en when requested locale missing", () => {
    const result = resolvePairingDescription({ descriptions: { en: "English" } }, "fr");
    expect(result.description).toBe("English");
    expect(result.locale).toBe("en");
    expect(result.isFallback).toBe(true);
  });

  test("falls back to first available locale when en missing", () => {
    const result = resolvePairingDescription({ descriptions: { de: "Deutsch" } }, "fr");
    expect(result.description).toBe("Deutsch");
    expect(result.locale).toBe("de");
    expect(result.isFallback).toBe(true);
  });

  test("legacy description field is returned as fallback", () => {
    const result = resolvePairingDescription({ description: "Legacy" }, "en");
    expect(result.description).toBe("Legacy");
    expect(result.isFallback).toBe(true);
  });

  test("no description at all returns empty string, isFallback false", () => {
    const result = resolvePairingDescription({}, "en");
    expect(result.description).toBe("");
    expect(result.isFallback).toBe(false);
  });
});
