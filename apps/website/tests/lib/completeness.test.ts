import { describe, expect, test } from "vite-plus/test";
import {
  computeCompletenessFromBlob,
  computeCompleteness,
  resolvePairingDescription,
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
  RECIPE_REQUIRED,
  RECIPE_RECOMMENDED,
} from "../../src/lib/completeness.ts";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../../src/lib/meta-sidecar.ts";

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

// ── computeCompletenessFromBlob: ingredient ───────────────────────────────────

describe("computeCompletenessFromBlob — ingredient required fields (table-driven)", () => {
  test.each([
    [{ category: "spice", summary: "A spice" }, "name"],
    [{ name: "Cardamom", summary: "A spice" }, "category"],
    [{ name: "Cardamom", category: "spice" }, "summary"],
  ])("missing required → score 0, red, missing contains %s", (ingredient, missingField) => {
    const result = computeCompletenessFromBlob("ingredient", ingredient, {});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain(missingField);
  });

  test("empty string summary → score 0", () => {
    const result = computeCompletenessFromBlob(
      "ingredient",
      { name: "Cardamom", category: "spice", summary: "" },
      {},
    );
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("summary");
  });
});

describe("computeCompletenessFromBlob — ingredient partial recommended (table-driven)", () => {
  test("all required, no recommended → score 0, red, all recommended in missing", () => {
    const result = computeCompletenessFromBlob("ingredient", { ...FULL_REQUIRED }, {});
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
    const result = computeCompletenessFromBlob("ingredient", ingredient, {});
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    for (const m of expectedMissing) {
      expect(result.missing).toContain(m);
    }
  });

  test("3 of 8 recommended filled → amber (score >= 40)", () => {
    const result = computeCompletenessFromBlob(
      "ingredient",
      {
        ...FULL_REQUIRED,
        description: "Aromatic",
        botanicalName: "Elettaria",
        family: "Zingiberaceae",
        origin: ["India"],
      },
      {},
    );
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.color).toBe("amber");
  });
});

describe("computeCompletenessFromBlob — ingredient images[0] handling", () => {
  test("empty images[] is treated as missing images[0]", () => {
    const result = computeCompletenessFromBlob("ingredient", { ...FULL_REQUIRED, images: [] }, {});
    expect(result.missing).toContain("images[0]");
  });

  test("images[] with one URL counts as filled", () => {
    const result = computeCompletenessFromBlob(
      "ingredient",
      { ...FULL_REQUIRED, images: ["https://example.com/img.jpg"] },
      {},
    );
    expect(result.missing).not.toContain("images[0]");
  });

  test("absent images field treated as missing images[0]", () => {
    const result = computeCompletenessFromBlob("ingredient", { ...FULL_REQUIRED }, {});
    expect(result.missing).toContain("images[0]");
  });

  test("empty parts[] is treated as missing", () => {
    const result = computeCompletenessFromBlob("ingredient", { ...FULL_REQUIRED, parts: [] }, {});
    expect(result.missing).toContain("parts");
  });
});

describe("computeCompletenessFromBlob — ingredient full coverage", () => {
  test("all required + all recommended → score 100, green, no missing", () => {
    const result = computeCompletenessFromBlob(
      "ingredient",
      { ...FULL_REQUIRED, ...FULL_RECOMMENDED },
      {},
    );
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

describe("computeCompletenessFromBlob — recipe required fields", () => {
  test.each([
    [{ recipeIngredient: ["salt"], recipeInstructions: ["Cook"] }, "name"],
    [{ name: "Ramen", recipeInstructions: ["Cook"] }, "recipeIngredient"],
    [{ name: "Ramen", recipeIngredient: [] }, "recipeIngredient"],
    [{ name: "Ramen", recipeIngredient: ["salt"] }, "recipeInstructions"],
  ])("missing required → score 0, red", (recipe, missingField) => {
    const result = computeCompletenessFromBlob("recipe", recipe, {});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain(missingField);
  });
});

describe("computeCompletenessFromBlob — recipe recommended and meta", () => {
  test("all required only → score 0, all recommended missing", () => {
    const result = computeCompletenessFromBlob("recipe", BASE_RECIPE, {});
    expect(result.score).toBe(0);
    expect(result.missing).toContain("meta.ingredientLinks");
    for (const f of RECIPE_RECOMMENDED) {
      expect(result.missing).toContain(f);
    }
  });

  test("all required + all recommended + meta links → score 100, green", () => {
    const result = computeCompletenessFromBlob(
      "recipe",
      { ...BASE_RECIPE, ...FULL_RECIPE_RECOMMENDED },
      { ingredientLinks: [{ pattern: "miso", slug: "miso-paste" }] },
    );
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });

  test("meta ingredientLinks count toward score", () => {
    const without = computeCompletenessFromBlob("recipe", BASE_RECIPE, {});
    const with_ = computeCompletenessFromBlob("recipe", BASE_RECIPE, {
      ingredientLinks: [{ pattern: "x", slug: "x" }],
    });
    expect(with_.score).toBeGreaterThan(without.score);
    expect(without.missing).toContain("meta.ingredientLinks");
    expect(with_.missing).not.toContain("meta.ingredientLinks");
  });

  test("empty ingredientLinks treated as missing", () => {
    const result = computeCompletenessFromBlob("recipe", BASE_RECIPE, { ingredientLinks: [] });
    expect(result.missing).toContain("meta.ingredientLinks");
  });
});

// ── computeCompletenessFromBlob: pairing ─────────────────────────────────────

const EP1 = { collection: "ingredients", slug: "cardamom" };
const EP2 = { collection: "ingredients", slug: "saffron" };

describe("computeCompletenessFromBlob — pairing missing required", () => {
  test("empty object → score 0, red, missing description", () => {
    const result = computeCompletenessFromBlob("pairing", {}, {});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("description");
  });

  test("description only (no endpoints) → score 0, red", () => {
    const result = computeCompletenessFromBlob("pairing", { description: "Good pair" }, {});
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
    expect(result.missing).toContain("endpoints");
  });
});

describe("computeCompletenessFromBlob — pairing complete", () => {
  test("description + endpoints → score 100, green, no missing", () => {
    const result = computeCompletenessFromBlob(
      "pairing",
      { description: "Good pair", endpoints: [EP1, EP2] },
      {},
    );
    expect(result.score).toBe(100);
    expect(result.color).toBe("green");
    expect(result.missing).toHaveLength(0);
  });
});

// ── computeCompleteness (caller-facing, async) ────────────────────────────────

describe("computeCompleteness — recipe via InMemoryStore + sidecar", () => {
  test("fetches content and meta, returns same result as computeCompletenessFromBlob", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    const recipe = { ...BASE_RECIPE, ...FULL_RECIPE_RECOMMENDED };
    const meta = { ingredientLinks: [{ pattern: "miso", slug: "miso-paste" }] };

    await store.put("recipes", "en/miso-ramen", recipe);
    await sidecar.write({ collection: "recipes", locale: "en", slug: "miso-ramen" }, meta);

    const ref = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };
    const fromStore = await computeCompleteness("recipe", ref, store);
    const fromBlob = computeCompletenessFromBlob("recipe", recipe, meta);

    expect(fromStore.score).toBe(fromBlob.score);
    expect(fromStore.color).toBe(fromBlob.color);
    expect(fromStore.missing).toEqual(fromBlob.missing);
  });

  test("missing content returns zero score", async () => {
    const store = new InMemoryStore();
    const ref = { collection: "recipes" as const, locale: "en", slug: "ghost" };
    const result = await computeCompleteness("recipe", ref, store);
    expect(result.score).toBe(0);
    expect(result.color).toBe("red");
  });
});

describe("computeCompleteness — ingredient via InMemoryStore", () => {
  test("fetches ingredient content, returns same result as computeCompletenessFromBlob", async () => {
    const store = new InMemoryStore();
    const ingredient = { ...FULL_REQUIRED, ...FULL_RECOMMENDED };

    await store.put("ingredients", "en/cardamom", ingredient);

    const ref = { collection: "ingredients" as const, locale: "en", slug: "cardamom" };
    const fromStore = await computeCompleteness("ingredient", ref, store);
    const fromBlob = computeCompletenessFromBlob("ingredient", ingredient, {});

    expect(fromStore.score).toBe(fromBlob.score);
    expect(fromStore.color).toBe(fromBlob.color);
    expect(fromStore.missing).toEqual(fromBlob.missing);
  });
});

describe("computeCompleteness — pairing via InMemoryStore", () => {
  test("fetches pairing content, returns same result as computeCompletenessFromBlob", async () => {
    const store = new InMemoryStore();
    const pairing = { description: "Good", endpoints: [EP1, EP2] };

    await store.put("pairings", "cardamom--pepper", pairing);

    const ref = { collection: "pairings" as const, slug: "cardamom--pepper" };
    const fromStore = await computeCompleteness("pairing", ref, store);
    const fromBlob = computeCompletenessFromBlob("pairing", pairing, {});

    expect(fromStore.score).toBe(fromBlob.score);
    expect(fromStore.color).toBe(fromBlob.color);
    expect(fromStore.missing).toEqual(fromBlob.missing);
  });
});

// ── resolvePairingDescription ─────────────────────────────────────────────────

describe("resolvePairingDescription", () => {
  test("returns description from per-locale content, isFallback false", () => {
    const result = resolvePairingDescription({ description: "Deutsch" }, "de");
    expect(result.description).toBe("Deutsch");
    expect(result.locale).toBe("de");
    expect(result.isFallback).toBe(false);
  });

  test("returns description field directly, no locale resolution needed", () => {
    const result = resolvePairingDescription({ description: "English" }, "en");
    expect(result.description).toBe("English");
    expect(result.locale).toBe("en");
    expect(result.isFallback).toBe(false);
  });

  test("no description returns empty string, isFallback false", () => {
    const result = resolvePairingDescription({}, "en");
    expect(result.description).toBe("");
    expect(result.isFallback).toBe(false);
  });
});
