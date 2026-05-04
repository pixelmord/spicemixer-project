import { describe, expect, test } from "vite-plus/test";
import { CURATE_REGISTRY, runCurate } from "../src/run-curate.ts";

// ── Registry structure ────────────────────────────────────────────────────────

describe("CURATE_REGISTRY structure", () => {
  test("has entries for all three EntityKinds", () => {
    expect(CURATE_REGISTRY.ingredient).toBeDefined();
    expect(CURATE_REGISTRY.recipe).toBeDefined();
    expect(CURATE_REGISTRY.pairing).toBeDefined();
  });

  test("ingredient registers improve, translate, pairings", () => {
    expect(typeof CURATE_REGISTRY.ingredient.improve).toBe("function");
    expect(typeof CURATE_REGISTRY.ingredient.translate).toBe("function");
    expect(typeof CURATE_REGISTRY.ingredient.pairings).toBe("function");
  });

  test("recipe registers improve, translate, links, tags, language, relations, slug", () => {
    const ops = ["improve", "translate", "links", "tags", "language", "relations", "slug"] as const;
    for (const op of ops) {
      expect(typeof CURATE_REGISTRY.recipe[op]).toBe("function");
    }
  });

  test("pairing registers improve, translate", () => {
    expect(typeof CURATE_REGISTRY.pairing.improve).toBe("function");
    expect(typeof CURATE_REGISTRY.pairing.translate).toBe("function");
  });

  test("each registered entry is a distinct function reference", () => {
    expect(CURATE_REGISTRY.ingredient.improve).not.toBe(CURATE_REGISTRY.recipe.improve);
    expect(CURATE_REGISTRY.ingredient.translate).not.toBe(CURATE_REGISTRY.recipe.translate);
    expect(CURATE_REGISTRY.ingredient.translate).not.toBe(CURATE_REGISTRY.pairing.translate);
  });
});

// ── runCurate dispatch guards ────────────────────────────────────────────────

describe("runCurate error guards", () => {
  test("throws for unknown kind", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(runCurate("mixture" as any, "improve")).rejects.toThrow(/Unknown EntityKind/);
  });

  test("throws for unknown operation on a known kind", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(runCurate("ingredient", "nonexistent" as any)).rejects.toThrow(
      /Unknown.*operation/,
    );
  });

  test("throws for unknown operation on recipe kind", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(runCurate("recipe", "pairings" as any)).rejects.toThrow(/Unknown.*operation/);
  });

  test("throws for unknown operation on pairing kind", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(runCurate("pairing", "links" as any)).rejects.toThrow(/Unknown.*operation/);
  });
});

// ── runCurate delegates to the right proposer ────────────────────────────────

describe("runCurate delegation", () => {
  test("ingredient improve delegates to CURATE_REGISTRY.ingredient.improve", async () => {
    const called: unknown[] = [];
    const originalFn = CURATE_REGISTRY.ingredient.improve;
    (CURATE_REGISTRY.ingredient as Record<string, unknown>).improve = async (
      ...args: unknown[]
    ) => {
      called.push(...args);
      return { fields: [] };
    };

    const snapshot = { name: "cardamom" };
    await runCurate("ingredient", "improve", snapshot, [], {} as never);

    expect(called[0]).toBe(snapshot);
    // restore
    (CURATE_REGISTRY.ingredient as Record<string, unknown>).improve = originalFn;
  });

  test("recipe tags delegates to CURATE_REGISTRY.recipe.tags", async () => {
    const called: unknown[] = [];
    const originalFn = CURATE_REGISTRY.recipe.tags;
    (CURATE_REGISTRY.recipe as Record<string, unknown>).tags = async (...args: unknown[]) => {
      called.push(...args);
      return { tags: [] };
    };

    const snapshot = { name: "ras el hanout" };
    await runCurate("recipe", "tags", snapshot, [], {} as never);

    expect(called[0]).toBe(snapshot);
    // restore
    (CURATE_REGISTRY.recipe as Record<string, unknown>).tags = originalFn;
  });

  test("pairing translate delegates to CURATE_REGISTRY.pairing.translate", async () => {
    const called: unknown[] = [];
    const originalFn = CURATE_REGISTRY.pairing.translate;
    (CURATE_REGISTRY.pairing as Record<string, unknown>).translate = async (...args: unknown[]) => {
      called.push(...args);
      return { targetLocale: "de", fields: {} };
    };

    const snapshot = { ingredient1: "cumin", ingredient2: "coriander", description: "test" };
    await runCurate("pairing", "translate", snapshot, "en", "de", {} as never);

    expect(called[0]).toBe(snapshot);
    // restore
    (CURATE_REGISTRY.pairing as Record<string, unknown>).translate = originalFn;
  });
});
