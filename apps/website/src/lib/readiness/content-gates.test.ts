import { describe, expect, test } from "vite-plus/test";
import {
  computeContentGates,
  MIXTURE_KINDS,
  INGREDIENT_CATEGORIES,
  type Corpus,
  type CorpusMixture,
  type CorpusIngredient,
  type CorpusPairing,
  type CorpusRecipe,
  type GateResult,
} from "./content-gates.ts";
import { REGIONS } from "../regions.ts";

// Helpers

function emptyCorpus(): Corpus {
  return { mixtures: [], ingredients: [], pairings: [], recipes: [] };
}

function mixture(slug: string, overrides: Partial<CorpusMixture> = {}): CorpusMixture {
  return { slug, regions: [], ...overrides };
}

function ingredient(slug: string, overrides: Partial<CorpusIngredient> = {}): CorpusIngredient {
  return {
    slug,
    category: "spice",
    flavorProfile: [],
    regions: [],
    culinaryUse: undefined,
    hasImage: false,
    ...overrides,
  };
}

function pairing(a: string, b: string): CorpusPairing {
  return { slugs: [a, b] };
}

function recipe(mixtureRefs: string[]): CorpusRecipe {
  return { mixtureRefs };
}

function gateByKey(results: GateResult[], key: string): GateResult {
  const g = results.find((r) => r.key === key);
  if (!g) throw new Error(`Gate "${key}" not found`);
  return g;
}

// ─── region-coverage ────────────────────────────────────────────────────────

describe("region-coverage", () => {
  test("pass — all 20 regions have ≥3 entries", () => {
    const corpus = emptyCorpus();
    for (const region of REGIONS) {
      for (let i = 0; i < 3; i++) {
        corpus.mixtures.push(mixture(`m-${region}-${i}`, { regions: [region] }));
      }
    }
    const gate = gateByKey(computeContentGates(corpus), "region-coverage");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(20);
    expect(gate.target).toBe(20);
    expect(gate.failingItems).toBeUndefined();
  });

  test("warn — all regions have ≥1 but some have <3", () => {
    // Each region gets exactly 1 entry (>0 but <3)
    const corpus = emptyCorpus();
    for (const region of REGIONS) {
      corpus.mixtures.push(mixture(`m-${region}`, { regions: [region] }));
    }
    const gate = gateByKey(computeContentGates(corpus), "region-coverage");
    expect(gate.status).toBe("warn");
  });

  test("fail — some region has 0 entries", () => {
    // Only give entries to half the regions
    const corpus = emptyCorpus();
    for (const region of REGIONS.slice(0, 10)) {
      for (let i = 0; i < 3; i++) {
        corpus.mixtures.push(mixture(`m-${region}-${i}`, { regions: [region] }));
      }
    }
    const gate = gateByKey(computeContentGates(corpus), "region-coverage");
    expect(gate.status).toBe("fail");
    expect(gate.failingItems).toBeDefined();
    expect(gate.failingItems!.length).toBeGreaterThan(0);
  });

  test("counts mixtures and ingredients combined per region", () => {
    const corpus = emptyCorpus();
    const region = "north-africa";
    corpus.mixtures.push(mixture("m1", { regions: [region] }));
    corpus.mixtures.push(mixture("m2", { regions: [region] }));
    corpus.ingredients.push(ingredient("i1", { regions: [region] }));
    const gate = gateByKey(computeContentGates(corpus), "region-coverage");
    // 3 entries for north-africa → passes for that region
    // but other regions still have 0 → fail overall
    expect(gate.status).toBe("fail");
    const northAfricaFailing = gate.failingItems?.find((s) => s.startsWith("north-africa"));
    expect(northAfricaFailing).toBeUndefined();
  });

  test("failingItems lists regions with counts", () => {
    const corpus = emptyCorpus();
    const gate = gateByKey(computeContentGates(corpus), "region-coverage");
    expect(gate.status).toBe("fail");
    expect(gate.failingItems!.length).toBe(20);
    expect(gate.failingItems![0]).toMatch(/0\/3/);
  });
});

// ─── mixture-kind-coverage ───────────────────────────────────────────────────

describe("mixture-kind-coverage", () => {
  test("pass — all 7 kinds have ≥3 examples", () => {
    const corpus = emptyCorpus();
    for (const kind of MIXTURE_KINDS) {
      for (let i = 0; i < 3; i++) {
        corpus.mixtures.push(mixture(`m-${kind}-${i}`, { kind }));
      }
    }
    const gate = gateByKey(computeContentGates(corpus), "mixture-kind-coverage");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(7);
    expect(gate.target).toBe(7);
    expect(gate.failingItems).toBeUndefined();
  });

  test("warn — all kinds have ≥1 but some have <3", () => {
    const corpus = emptyCorpus();
    for (const kind of MIXTURE_KINDS) {
      corpus.mixtures.push(mixture(`m-${kind}`, { kind }));
    }
    const gate = gateByKey(computeContentGates(corpus), "mixture-kind-coverage");
    expect(gate.status).toBe("warn");
  });

  test("fail — some kind has 0 examples", () => {
    const corpus = emptyCorpus();
    // Only add spicemix and sauce
    for (let i = 0; i < 3; i++) {
      corpus.mixtures.push(mixture(`spicemix-${i}`, { kind: "spicemix" }));
      corpus.mixtures.push(mixture(`sauce-${i}`, { kind: "sauce" }));
    }
    const gate = gateByKey(computeContentGates(corpus), "mixture-kind-coverage");
    expect(gate.status).toBe("fail");
    expect(gate.failingItems?.some((s) => s.includes("rub"))).toBe(true);
  });

  test("fail on empty corpus — all kinds have 0 examples", () => {
    const gate = gateByKey(computeContentGates(emptyCorpus()), "mixture-kind-coverage");
    expect(gate.status).toBe("fail");
    expect(gate.current).toBe(0);
    expect(gate.target).toBe(7);
    expect(gate.failingItems).toHaveLength(7);
  });

  test("ignores unknown kind values", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("unknown", { kind: "unknown-kind" }));
    const gate = gateByKey(computeContentGates(corpus), "mixture-kind-coverage");
    expect(gate.status).toBe("fail");
  });
});

// ─── ingredient-category-coverage ────────────────────────────────────────────

describe("ingredient-category-coverage", () => {
  test("pass — all 7 categories have ≥5 examples", () => {
    const corpus = emptyCorpus();
    for (const category of INGREDIENT_CATEGORIES) {
      for (let i = 0; i < 5; i++) {
        corpus.ingredients.push(ingredient(`i-${category}-${i}`, { category }));
      }
    }
    const gate = gateByKey(computeContentGates(corpus), "ingredient-category-coverage");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(7);
    expect(gate.target).toBe(7);
    expect(gate.failingItems).toBeUndefined();
  });

  test("warn — all categories have ≥1 but some have <5", () => {
    const corpus = emptyCorpus();
    for (const category of INGREDIENT_CATEGORIES) {
      corpus.ingredients.push(ingredient(`i-${category}`, { category }));
    }
    const gate = gateByKey(computeContentGates(corpus), "ingredient-category-coverage");
    expect(gate.status).toBe("warn");
  });

  test("fail — some category has 0 examples", () => {
    const corpus = emptyCorpus();
    // Only populate 'spice'
    for (let i = 0; i < 5; i++) {
      corpus.ingredients.push(ingredient(`spice-${i}`, { category: "spice" }));
    }
    const gate = gateByKey(computeContentGates(corpus), "ingredient-category-coverage");
    expect(gate.status).toBe("fail");
    expect(gate.failingItems?.some((s) => s.includes("herb"))).toBe(true);
  });

  test("ignores 'other' category", () => {
    const corpus = emptyCorpus();
    for (let i = 0; i < 10; i++) {
      corpus.ingredients.push(ingredient(`other-${i}`, { category: "other" }));
    }
    const gate = gateByKey(computeContentGates(corpus), "ingredient-category-coverage");
    expect(gate.status).toBe("fail"); // 'other' not counted toward any gate category
  });
});

// ─── graph-connectivity ───────────────────────────────────────────────────────

describe("graph-connectivity", () => {
  test("pass — no mixtures (vacuously true)", () => {
    const gate = gateByKey(computeContentGates(emptyCorpus()), "graph-connectivity");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(0);
    expect(gate.target).toBe(0);
  });

  test("pass — all mixtures appear in a pairing", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("berbere"));
    corpus.mixtures.push(mixture("harissa"));
    corpus.pairings.push(pairing("berbere", "cumin"));
    corpus.pairings.push(pairing("cardamom", "harissa"));
    const gate = gateByKey(computeContentGates(corpus), "graph-connectivity");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(2);
    expect(gate.target).toBe(2);
  });

  test("pass — mixture connected via recipe reference", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("berbere"));
    corpus.recipes.push(recipe(["berbere"]));
    const gate = gateByKey(computeContentGates(corpus), "graph-connectivity");
    expect(gate.status).toBe("pass");
  });

  test("pass — mix of pairing and recipe connections", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("berbere"));
    corpus.mixtures.push(mixture("harissa"));
    corpus.pairings.push(pairing("berbere", "cumin"));
    corpus.recipes.push(recipe(["harissa"]));
    const gate = gateByKey(computeContentGates(corpus), "graph-connectivity");
    expect(gate.status).toBe("pass");
  });

  test("fail — mixture has no pairing and no recipe reference", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("berbere"));
    corpus.mixtures.push(mixture("harissa"));
    corpus.pairings.push(pairing("berbere", "cumin")); // berbere connected
    // harissa has no connections
    const gate = gateByKey(computeContentGates(corpus), "graph-connectivity");
    expect(gate.status).toBe("fail");
    expect(gate.current).toBe(1);
    expect(gate.failingItems).toEqual(["harissa"]);
  });

  test("fail — pairings exist but none involve the mixture", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("berbere"));
    corpus.pairings.push(pairing("cumin", "caraway")); // doesn't involve berbere
    const gate = gateByKey(computeContentGates(corpus), "graph-connectivity");
    expect(gate.status).toBe("fail");
    expect(gate.failingItems).toEqual(["berbere"]);
  });
});

// ─── pairing-density ──────────────────────────────────────────────────────────

describe("pairing-density", () => {
  test("pass — pairings ≥ 3× mixture count", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("m1"), mixture("m2"));
    // 2 mixtures → need 6 pairings
    for (let i = 0; i < 6; i++) corpus.pairings.push(pairing(`a${i}`, `b${i}`));
    const gate = gateByKey(computeContentGates(corpus), "pairing-density");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(6);
    expect(gate.target).toBe(6);
  });

  test("warn — pairings ≥ 2× but < 3× mixture count", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("m1"), mixture("m2")); // 2 mixtures → warn range: 4–5
    for (let i = 0; i < 4; i++) corpus.pairings.push(pairing(`a${i}`, `b${i}`));
    const gate = gateByKey(computeContentGates(corpus), "pairing-density");
    expect(gate.status).toBe("warn");
    expect(gate.target).toBe(6);
  });

  test("fail — pairings < 2× mixture count", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("m1"), mixture("m2"), mixture("m3")); // 3 mixtures → fail below 6
    corpus.pairings.push(pairing("a", "b")); // 1 pairing
    const gate = gateByKey(computeContentGates(corpus), "pairing-density");
    expect(gate.status).toBe("fail");
  });

  test("pass — no mixtures (target is 0)", () => {
    const corpus = emptyCorpus();
    const gate = gateByKey(computeContentGates(corpus), "pairing-density");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(0);
    expect(gate.target).toBe(0);
  });

  test("fail — has mixtures but zero pairings", () => {
    const corpus = emptyCorpus();
    corpus.mixtures.push(mixture("m1"));
    const gate = gateByKey(computeContentGates(corpus), "pairing-density");
    expect(gate.status).toBe("fail");
    expect(gate.current).toBe(0);
    expect(gate.target).toBe(3);
  });
});

// ─── ingredient-completeness ──────────────────────────────────────────────────

describe("ingredient-completeness", () => {
  const completeIngredient = (slug: string): CorpusIngredient =>
    ingredient(slug, {
      flavorProfile: ["warm"],
      regions: ["north-africa"],
      culinaryUse: "Used in spice blends",
      hasImage: true,
    });

  test("pass — ≥80% of ingredients complete", () => {
    const corpus = emptyCorpus();
    for (let i = 0; i < 8; i++) corpus.ingredients.push(completeIngredient(`complete-${i}`));
    corpus.ingredients.push(ingredient("incomplete")); // 8/9 = 88.9% ≥ 80%
    const gate = gateByKey(computeContentGates(corpus), "ingredient-completeness");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(8);
    expect(gate.target).toBe(9);
  });

  test("warn — 60–79% complete", () => {
    const corpus = emptyCorpus();
    for (let i = 0; i < 7; i++) corpus.ingredients.push(completeIngredient(`complete-${i}`));
    for (let i = 0; i < 3; i++) corpus.ingredients.push(ingredient(`incomplete-${i}`));
    // 7/10 = 70% → warn
    const gate = gateByKey(computeContentGates(corpus), "ingredient-completeness");
    expect(gate.status).toBe("warn");
    expect(gate.failingItems).toHaveLength(3);
  });

  test("fail — <60% complete", () => {
    const corpus = emptyCorpus();
    for (let i = 0; i < 4; i++) corpus.ingredients.push(completeIngredient(`complete-${i}`));
    for (let i = 0; i < 6; i++) corpus.ingredients.push(ingredient(`incomplete-${i}`));
    // 4/10 = 40% → fail
    const gate = gateByKey(computeContentGates(corpus), "ingredient-completeness");
    expect(gate.status).toBe("fail");
    expect(gate.failingItems).toHaveLength(6);
  });

  test("pass — no ingredients (vacuously true)", () => {
    const gate = gateByKey(computeContentGates(emptyCorpus()), "ingredient-completeness");
    expect(gate.status).toBe("pass");
    expect(gate.current).toBe(0);
    expect(gate.target).toBe(0);
  });

  test("requires all four fields: flavorProfile, regions, culinaryUse, image", () => {
    const base: CorpusIngredient = {
      slug: "i",
      category: "spice",
      flavorProfile: ["warm"],
      regions: ["north-africa"],
      culinaryUse: "Used",
      hasImage: true,
    };

    type Case = [string, Partial<CorpusIngredient>, "pass" | "fail"];
    const cases: Case[] = [
      ["all fields present", {}, "pass"],
      ["missing flavorProfile", { flavorProfile: [] }, "fail"],
      ["missing regions", { regions: [] }, "fail"],
      ["missing culinaryUse", { culinaryUse: undefined }, "fail"],
      ["culinaryUse whitespace-only", { culinaryUse: "   " }, "fail"],
      ["missing image", { hasImage: false }, "fail"],
    ];

    for (const [name, overrides, expected] of cases) {
      const corpus: Corpus = {
        mixtures: [],
        ingredients: [{ ...base, ...overrides }],
        pairings: [],
        recipes: [],
      };
      const gate = gateByKey(computeContentGates(corpus), "ingredient-completeness");
      const pct =
        gate.current === gate.target ? 100 : Math.round((gate.current / gate.target) * 100);
      expect(pct >= 80 ? "pass" : "fail", name).toBe(expected);
    }
  });
});

// ─── computeContentGates returns all 6 gates ─────────────────────────────────

describe("computeContentGates", () => {
  test("returns exactly 6 gates in order", () => {
    const results = computeContentGates(emptyCorpus());
    const keys = results.map((g) => g.key);
    expect(keys).toEqual([
      "region-coverage",
      "mixture-kind-coverage",
      "ingredient-category-coverage",
      "graph-connectivity",
      "pairing-density",
      "ingredient-completeness",
    ]);
  });
});
