import { describe, expect, test } from "vite-plus/test";
import {
  translationBehaviorSchema,
  resolveTranslation,
  type FieldConfig,
} from "../src/translation.ts";
import { ingredientFieldConfig } from "../src/contracts/ingredient.ts";
import { recipeFieldConfig } from "../src/contracts/recipe.ts";
import { pairingFieldConfig } from "../src/contracts/pairing.ts";

// ── TranslationBehavior schema parsing ────────────────────────────────────────

describe("translationBehaviorSchema — each mode parses", () => {
  test("translate", () => {
    expect(translationBehaviorSchema.parse({ mode: "translate" })).toEqual({ mode: "translate" });
  });

  test("copy", () => {
    expect(translationBehaviorSchema.parse({ mode: "copy" })).toEqual({ mode: "copy" });
  });

  test("localize without instruction", () => {
    expect(translationBehaviorSchema.parse({ mode: "localize" })).toEqual({ mode: "localize" });
  });

  test("localize with instruction", () => {
    expect(
      translationBehaviorSchema.parse({ mode: "localize", instruction: "Use local vocabulary" }),
    ).toEqual({ mode: "localize", instruction: "Use local vocabulary" });
  });

  test("skip", () => {
    expect(translationBehaviorSchema.parse({ mode: "skip" })).toEqual({ mode: "skip" });
  });

  test("unknown mode throws", () => {
    expect(() => translationBehaviorSchema.parse({ mode: "mutate" })).toThrow();
  });
});

// ── FieldConfig.translation default ──────────────────────────────────────────

describe("resolveTranslation — default applied when omitted", () => {
  test("undefined config → translate", () => {
    expect(resolveTranslation(undefined)).toEqual({ mode: "translate" });
  });

  test("empty FieldConfig → translate", () => {
    const cfg: FieldConfig = {};
    expect(resolveTranslation(cfg)).toEqual({ mode: "translate" });
  });

  test("explicit copy → copy", () => {
    const cfg: FieldConfig = { translation: { mode: "copy" } };
    expect(resolveTranslation(cfg)).toEqual({ mode: "copy" });
  });

  test("explicit localize → localize", () => {
    const cfg: FieldConfig = { translation: { mode: "localize", instruction: "hi" } };
    expect(resolveTranslation(cfg)).toEqual({ mode: "localize", instruction: "hi" });
  });

  test("explicit skip → skip", () => {
    const cfg: FieldConfig = { translation: { mode: "skip" } };
    expect(resolveTranslation(cfg)).toEqual({ mode: "skip" });
  });
});

// ── Ingredient contract ───────────────────────────────────────────────────────

describe("ingredientFieldConfig", () => {
  test("name → translate", () => {
    expect(ingredientFieldConfig.name?.translation?.mode).toBe("translate");
  });

  test("summary → translate", () => {
    expect(ingredientFieldConfig.summary?.translation?.mode).toBe("translate");
  });

  test("description → translate", () => {
    expect(ingredientFieldConfig.description?.translation?.mode).toBe("translate");
  });

  test("botanicalName → copy", () => {
    expect(ingredientFieldConfig.botanicalName?.translation?.mode).toBe("copy");
  });

  test("region → copy", () => {
    expect(ingredientFieldConfig.region?.translation?.mode).toBe("copy");
  });

  test("images → copy", () => {
    expect(ingredientFieldConfig.images?.translation?.mode).toBe("copy");
  });

  test("sources[].url → copy", () => {
    expect(ingredientFieldConfig["sources[].url"]?.translation?.mode).toBe("copy");
  });

  test("sources[].title → translate", () => {
    expect(ingredientFieldConfig["sources[].title"]?.translation?.mode).toBe("translate");
  });

  test("all declared fields use valid modes", () => {
    const validModes = new Set(["translate", "copy", "localize", "skip"]);
    for (const [field, config] of Object.entries(ingredientFieldConfig)) {
      if (config.translation) {
        expect(validModes.has(config.translation.mode), `field "${field}" has unknown mode`).toBe(
          true,
        );
      }
    }
  });
});

// ── Recipe contract ───────────────────────────────────────────────────────────

describe("recipeFieldConfig", () => {
  test("name → translate", () => {
    expect(recipeFieldConfig.name?.translation?.mode).toBe("translate");
  });

  test("slug → translate", () => {
    expect(recipeFieldConfig.slug?.translation?.mode).toBe("translate");
  });

  test("recipeCuisine → translate", () => {
    expect(recipeFieldConfig.recipeCuisine?.translation?.mode).toBe("translate");
  });

  test("keywords → localize", () => {
    expect(recipeFieldConfig.keywords?.translation?.mode).toBe("localize");
  });

  test("image → copy", () => {
    expect(recipeFieldConfig.image?.translation?.mode).toBe("copy");
  });

  test("prepTime → copy", () => {
    expect(recipeFieldConfig.prepTime?.translation?.mode).toBe("copy");
  });

  test("all declared fields use valid modes", () => {
    const validModes = new Set(["translate", "copy", "localize", "skip"]);
    for (const [field, config] of Object.entries(recipeFieldConfig)) {
      if (config.translation) {
        expect(validModes.has(config.translation.mode), `field "${field}" has unknown mode`).toBe(
          true,
        );
      }
    }
  });
});

// ── Pairing contract ──────────────────────────────────────────────────────────

describe("pairingFieldConfig", () => {
  test("description → translate", () => {
    expect(pairingFieldConfig.description?.translation?.mode).toBe("translate");
  });

  test("image → copy", () => {
    expect(pairingFieldConfig.image?.translation?.mode).toBe("copy");
  });

  test("ingredients → copy", () => {
    expect(pairingFieldConfig.ingredients?.translation?.mode).toBe("copy");
  });

  test("all declared fields use valid modes", () => {
    const validModes = new Set(["translate", "copy", "localize", "skip"]);
    for (const [field, config] of Object.entries(pairingFieldConfig)) {
      if (config.translation) {
        expect(validModes.has(config.translation.mode), `field "${field}" has unknown mode`).toBe(
          true,
        );
      }
    }
  });
});
