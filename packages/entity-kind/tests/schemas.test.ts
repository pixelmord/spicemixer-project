import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import {
  ingredientSchema,
  ingredientMetaSchema,
  pairingSchema,
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

describe("pairingSchema — new shape", () => {
  const ep1 = { collection: "ingredients", slug: "cardamom" };
  const ep2 = { collection: "mixtures", slug: "harissa" };

  test("accepts valid new shape with endpoints and description", () => {
    const result = pairingSchema.parse({
      endpoints: [ep1, ep2],
      description: "Warm and aromatic.",
    });
    expect(result.endpoints[0]).toEqual(ep1);
    expect(result.endpoints[1]).toEqual(ep2);
    expect(result.description).toBe("Warm and aromatic.");
  });

  test("accepts recipes as endpoint collection", () => {
    const result = pairingSchema.parse({
      endpoints: [{ collection: "recipes", slug: "miso-ramen" }, ep2],
      description: "A bold combination.",
    });
    expect(result.endpoints[0].collection).toBe("recipes");
  });

  test("rejects old descriptions: { en, de } shape", () => {
    expect(() =>
      pairingSchema.parse({
        endpoints: [ep1, ep2],
        descriptions: { en: "Old", de: "Alt" },
      }),
    ).toThrow();
  });

  test("rejects old ingredients: tuple<string, string> shape", () => {
    expect(() =>
      pairingSchema.parse({
        ingredients: ["cardamom", "saffron"],
        description: "Floral.",
      }),
    ).toThrow();
  });

  test("rejects unknown collection in endpoint", () => {
    expect(() =>
      pairingSchema.parse({
        endpoints: [{ collection: "unknown", slug: "foo" }, ep2],
        description: "x",
      }),
    ).toThrow();
  });

  test("description is required — rejects missing description", () => {
    expect(() =>
      pairingSchema.parse({
        endpoints: [ep1, ep2],
      }),
    ).toThrow();
  });
});

describe("pairingMetaSchema", () => {
  test("parses minimal valid meta (empty object)", () => {
    const result = pairingMetaSchema.parse({});
    expect(result.draft).toBe(false);
    expect(result.aiEvents).toEqual([]);
    expect(result.featured).toBe(false);
    expect(result.translations).toEqual({});
  });

  test("parses draft: true", () => {
    const result = pairingMetaSchema.parse({ draft: true });
    expect(result.draft).toBe(true);
  });

  test("parses featured: true", () => {
    const result = pairingMetaSchema.parse({ featured: true });
    expect(result.featured).toBe(true);
  });

  test("defaults featured to false", () => {
    const result = pairingMetaSchema.parse({});
    expect(result.featured).toBe(false);
  });

  test("strips unknown fields", () => {
    const result = pairingMetaSchema.parse({ draft: false, unknown: "ignored" });
    expect(result).not.toHaveProperty("unknown");
  });

  test("preserves canonicalLocale", () => {
    const result = pairingMetaSchema.parse({ canonicalLocale: "de" });
    expect(result.canonicalLocale).toBe("de");
  });

  test("preserves translationOf", () => {
    const result = pairingMetaSchema.parse({ translationOf: "cardamom--saffron" });
    expect(result.translationOf).toBe("cardamom--saffron");
  });
});

describe("recipeMetaSchema", () => {
  test("parses minimal valid meta (empty object)", () => {
    const result = recipeMetaSchema.parse({});
    expect(result.draft).toBe(false);
    expect(result.aiEvents).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.ingredientLinks).toEqual([]);
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

  test("variants still present as authored symmetric list", () => {
    const result = recipeMetaSchema.parse({ variants: ["harissa-moroccan", "harissa-lebanese"] });
    expect(result.variants).toEqual(["harissa-moroccan", "harissa-lebanese"]);
  });

  test("strips deleted goesWellWith field from old shape", () => {
    const result = recipeMetaSchema.parse({
      goesWellWith: [{ collection: "recipes", slug: "miso-ramen" }],
    });
    expect(result).not.toHaveProperty("goesWellWith");
  });

  test("strips deleted usesBase field from old shape", () => {
    const result = recipeMetaSchema.parse({
      usesBase: [{ collection: "mixtures", slug: "harissa" }],
    });
    expect(result).not.toHaveProperty("usesBase");
  });

  test("strips deleted variantOf field from old shape", () => {
    const result = recipeMetaSchema.parse({ variantOf: "harissa-canonical" });
    expect(result).not.toHaveProperty("variantOf");
  });
});

describe("ingredientSchema — pairings removed", () => {
  test("parses valid ingredient without pairings field", () => {
    const result = ingredientSchema.parse({ name: "Cardamom", category: "spice" });
    expect(result).not.toHaveProperty("pairings");
  });

  test("strips old pairings field from old shape", () => {
    const result = ingredientSchema.parse({
      name: "Cardamom",
      category: "spice",
      pairings: [{ slug: "saffron", note: "Floral pair" }],
    });
    expect(result).not.toHaveProperty("pairings");
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
