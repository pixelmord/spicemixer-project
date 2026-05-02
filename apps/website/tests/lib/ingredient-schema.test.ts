import { describe, expect, test } from "vite-plus/test";
import {
  INGREDIENT_PARTS,
  INGREDIENT_FLAVOR_PROFILE,
  INGREDIENT_SECTION_FIELDS,
} from "../../src/lib/ingredient-schema.ts";

describe("INGREDIENT_PARTS", () => {
  test("is an array with the expected plant parts", () => {
    expect(INGREDIENT_PARTS).toContain("seed");
    expect(INGREDIENT_PARTS).toContain("leaf");
    expect(INGREDIENT_PARTS).toContain("root");
    expect(INGREDIENT_PARTS).toContain("bark");
    expect(INGREDIENT_PARTS).toContain("fruit");
    expect(INGREDIENT_PARTS).toContain("flower");
    expect(INGREDIENT_PARTS).toContain("bulb");
    expect(INGREDIENT_PARTS).toContain("rhizome");
  });

  test("has no duplicates", () => {
    expect(new Set(INGREDIENT_PARTS).size).toBe(INGREDIENT_PARTS.length);
  });
});

describe("INGREDIENT_FLAVOR_PROFILE", () => {
  test("is an array with the expected flavor values", () => {
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("warm");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("citrusy");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("bitter");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("pungent");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("sweet");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("earthy");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("floral");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("herbaceous");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("smoky");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("umami");
    expect(INGREDIENT_FLAVOR_PROFILE).toContain("sour");
  });

  test("has no duplicates", () => {
    expect(new Set(INGREDIENT_FLAVOR_PROFILE).size).toBe(INGREDIENT_FLAVOR_PROFILE.length);
  });
});

describe("INGREDIENT_SECTION_FIELDS", () => {
  test("includes the long-form section names", () => {
    expect(INGREDIENT_SECTION_FIELDS).toContain("culinaryUse");
    expect(INGREDIENT_SECTION_FIELDS).toContain("history");
    expect(INGREDIENT_SECTION_FIELDS).toContain("storage");
    expect(INGREDIENT_SECTION_FIELDS).toContain("sourcing");
  });
});
