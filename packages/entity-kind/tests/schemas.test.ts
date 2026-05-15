import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import {
  ingredientSchema,
  ingredientMetaSchema,
  pairingMetaSchema,
  recipeMetaSchema,
} from "../src/schemas.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ingredientSchema — region", () => {
  test("defaults region to empty array when absent", () => {
    const result = ingredientSchema.parse({ name: "Cumin", category: "spice" });
    expect(result.region).toEqual([]);
  });

  test("accepts valid region codes", () => {
    const result = ingredientSchema.parse({
      name: "Cumin",
      category: "spice",
      region: ["south-asia", "north-africa"],
    });
    expect(result.region).toEqual(["south-asia", "north-africa"]);
  });

  test("rejects unknown region codes", () => {
    expect(() =>
      ingredientSchema.parse({
        name: "Cumin",
        category: "spice",
        region: ["not-a-real-region"],
      }),
    ).toThrow();
  });
});

describe("ingredientMetaSchema", () => {
  test("parses minimal valid meta (empty object)", () => {
    const result = ingredientMetaSchema.parse({});
    expect(result.draft).toBe(false);
    expect(result.aiEvents).toEqual([]);
    expect(result.translations).toEqual({});
  });

  test("parses draft: true", () => {
    const result = ingredientMetaSchema.parse({ draft: true });
    expect(result.draft).toBe(true);
  });

  test("preserves canonicalLocale", () => {
    const result = ingredientMetaSchema.parse({ canonicalLocale: "de" });
    expect(result.canonicalLocale).toBe("de");
  });

  test("preserves translationOf", () => {
    const result = ingredientMetaSchema.parse({ translationOf: "cardamom" });
    expect(result.translationOf).toBe("cardamom");
  });

  test("no kind field on ingredient meta", () => {
    const schema = ingredientMetaSchema.shape;
    expect("kind" in schema).toBe(false);
  });
});

describe("pairingMetaSchema", () => {
  test("parses minimal valid meta (empty object)", () => {
    const result = pairingMetaSchema.parse({});
    expect(result.draft).toBe(false);
    expect(result.aiEvents).toEqual([]);
  });

  test("parses draft: true", () => {
    const result = pairingMetaSchema.parse({ draft: true });
    expect(result.draft).toBe(true);
  });

  test("strips unknown fields", () => {
    const result = pairingMetaSchema.parse({ draft: false, unknown: "ignored" });
    expect(result).not.toHaveProperty("unknown");
  });
});

describe("recipeMetaSchema", () => {
  test("parses minimal valid meta (empty object)", () => {
    const result = recipeMetaSchema.parse({});
    expect(result.draft).toBe(false);
    expect(result.aiEvents).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.ingredientLinks).toEqual([]);
    expect(result.goesWellWith).toEqual([]);
    expect(result.usesBase).toEqual([]);
    expect(result.variants).toEqual([]);
    expect(result.translations).toEqual({});
  });

  test("accepts a known mixture kind", () => {
    const result = recipeMetaSchema.parse({ kind: "spicemix" });
    expect(result.kind).toBe("spicemix");
  });

  test("accepts kind: recipe", () => {
    const result = recipeMetaSchema.parse({ kind: "recipe" });
    expect(result.kind).toBe("recipe");
  });

  test("rejects an unknown kind", () => {
    expect(() => recipeMetaSchema.parse({ kind: "unknownkind" })).toThrow();
  });

  test("accepts draft: true", () => {
    const result = recipeMetaSchema.parse({ draft: true });
    expect(result.draft).toBe(true);
  });
});

describe("no-redeclaration guard", () => {
  test("content.config.ts does not redeclare schemas owned by entity-kind", () => {
    const contentConfigPath = resolve(__dirname, "../../../apps/website/src/content.config.ts");
    const source = readFileSync(contentConfigPath, "utf-8");
    const redeclared = [
      "ingredientSchema",
      "pairingSchema",
      "ingredientMetaSchema",
      "pairingMetaSchema",
      "recipeMetaSchema",
    ].filter((name) => new RegExp(`const ${name}\\s*=`).test(source));
    expect(redeclared).toEqual([]);
  });
});
