import { describe, expect, test } from "vite-plus/test";
import { withPagefindFilters } from "../../src/lib/withPagefindFilters.ts";

describe("withPagefindFilters", () => {
  test("empty record returns empty map", () => {
    expect(withPagefindFilters({})).toEqual({});
  });

  test("undefined string fields are omitted", () => {
    expect(
      withPagefindFilters({ kind: undefined, category: undefined, cuisine: undefined }),
    ).toEqual({});
  });

  test("null fields are omitted", () => {
    expect(withPagefindFilters({ kind: null, region: null, flavorProfile: null })).toEqual({});
  });

  test("empty array fields are omitted", () => {
    expect(withPagefindFilters({ region: [], flavorProfile: [] })).toEqual({});
  });

  test("mixture: kind + region + cuisine included", () => {
    const result = withPagefindFilters({
      kind: "sauce",
      region: ["levant"],
      cuisine: "Middle Eastern",
    });
    expect(result).toEqual({ kind: "sauce", region: "levant", cuisine: "Middle Eastern" });
  });

  test("mixture: multi-region joined by comma", () => {
    const result = withPagefindFilters({ region: ["north-africa", "mediterranean"] });
    expect(result.region).toBe("north-africa,mediterranean");
  });

  test("ingredient: category + flavorProfile included", () => {
    const result = withPagefindFilters({ category: "spice", flavorProfile: ["warm", "earthy"] });
    expect(result).toEqual({ category: "spice", flavorProfile: "warm,earthy" });
  });

  test("ingredient: single flavorProfile string passthrough", () => {
    const result = withPagefindFilters({ flavorProfile: "citrusy" });
    expect(result.flavorProfile).toBe("citrusy");
  });

  test("recipe: cuisine only", () => {
    const result = withPagefindFilters({ cuisine: "Italian", kind: null, region: null });
    expect(result).toEqual({ cuisine: "Italian" });
  });

  test("pairing: region array joined", () => {
    const result = withPagefindFilters({ region: ["north-africa", "mediterranean"] });
    expect(result).toEqual({ region: "north-africa,mediterranean" });
  });

  test("all fields populated returns full map", () => {
    const result = withPagefindFilters({
      kind: "spicemix",
      region: ["south-asia"],
      category: "spice",
      flavorProfile: ["warm", "pungent"],
      cuisine: "Indian",
    });
    expect(result).toEqual({
      kind: "spicemix",
      region: "south-asia",
      category: "spice",
      flavorProfile: "warm,pungent",
      cuisine: "Indian",
    });
  });
});
