import { describe, expect, test } from "vite-plus/test";
import { loadFlags, toggleFlag } from "./capability-flags.ts";
import { InMemoryStore } from "../stores/in-memory.ts";
import {
  computeContentGates,
  MIXTURE_KINDS,
  INGREDIENT_CATEGORIES,
  type Corpus,
} from "./content-gates.ts";
import { REGIONS } from "../regions.ts";

describe("loadFlags", () => {
  test("returns default flags when store is empty", async () => {
    const store = new InMemoryStore();
    const flags = await loadFlags(store);
    expect(flags).toHaveLength(4);
    expect(flags.map((f) => f.key)).toEqual([
      "github-store-dogfooded",
      "auth-and-moderation",
      "attribution",
      "ai-suppression-proven",
    ]);
    expect(flags.every((f) => f.complete === false)).toBe(true);
    expect(flags.every((f) => f.completedAt === null)).toBe(true);
    expect(flags.every((f) => f.completedBy === null)).toBe(true);
  });

  test("returns persisted flags when store has data", async () => {
    const store = new InMemoryStore();
    const initial = await loadFlags(store);
    await store.put("meta", "readiness/capability-flags", [
      {
        ...initial[0],
        complete: true,
        completedAt: "2026-01-01T00:00:00.000Z",
        completedBy: "test",
      },
      ...initial.slice(1),
    ]);
    const loaded = await loadFlags(store);
    expect(loaded[0].complete).toBe(true);
    expect(loaded[0].completedBy).toBe("test");
    expect(loaded.slice(1).every((f) => f.complete === false)).toBe(true);
  });
});

describe("toggleFlag", () => {
  test("round-trip: load → toggle on → save → reload returns complete=true", async () => {
    const store = new InMemoryStore();
    const flagged = await toggleFlag(store, "github-store-dogfooded", "lead-curator");
    const toggled = flagged.find((f) => f.key === "github-store-dogfooded")!;
    expect(toggled.complete).toBe(true);
    expect(toggled.completedBy).toBe("lead-curator");
    expect(toggled.completedAt).toBeTruthy();

    // Reload from store confirms persistence
    const reloaded = await loadFlags(store);
    expect(reloaded.find((f) => f.key === "github-store-dogfooded")!.complete).toBe(true);
  });

  test("round-trip: toggle off — complete=true → complete=false", async () => {
    const store = new InMemoryStore();
    await toggleFlag(store, "attribution", "admin");
    const afterOff = await toggleFlag(store, "attribution", "admin");
    const flag = afterOff.find((f) => f.key === "attribution")!;
    expect(flag.complete).toBe(false);
    expect(flag.completedAt).toBeNull();
    expect(flag.completedBy).toBeNull();
  });

  test("toggling one flag does not affect others", async () => {
    const store = new InMemoryStore();
    await toggleFlag(store, "auth-and-moderation", "admin");
    const flags = await loadFlags(store);
    const others = flags.filter((f) => f.key !== "auth-and-moderation");
    expect(others.every((f) => f.complete === false)).toBe(true);
  });

  test("throws on unknown key", async () => {
    const store = new InMemoryStore();
    await expect(toggleFlag(store, "not-a-real-flag", "admin")).rejects.toThrow(
      "Unknown capability flag key: not-a-real-flag",
    );
  });

  test("completedAt is an ISO datetime string when toggled on", async () => {
    const store = new InMemoryStore();
    const flags = await toggleFlag(store, "ai-suppression-proven", "admin");
    const flag = flags.find((f) => f.key === "ai-suppression-proven")!;
    expect(() => new Date(flag.completedAt!)).not.toThrow();
    expect(flag.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("integration — corpus + flags readiness summary", () => {
  test("seeded corpus produces expected gate pass/fail counts", () => {
    // Minimal corpus: no entries at all → all gates fail or pass vacuously
    const corpus: Corpus = {
      mixtures: [],
      ingredients: [],
      pairings: [],
      recipes: [],
    };
    const gates = computeContentGates(corpus);
    expect(gates).toHaveLength(6);

    // With empty corpus: region-coverage fails (regions have 0),
    // mixture-kind-coverage fails, ingredient-category-coverage fails,
    // graph-connectivity passes (no mixtures), pairing-density passes (no mixtures),
    // ingredient-completeness passes (no ingredients)
    const statuses = Object.fromEntries(gates.map((g) => [g.key, g.status]));
    expect(statuses["region-coverage"]).toBe("fail");
    expect(statuses["mixture-kind-coverage"]).toBe("fail");
    expect(statuses["ingredient-category-coverage"]).toBe("fail");
    expect(statuses["graph-connectivity"]).toBe("pass");
    expect(statuses["pairing-density"]).toBe("pass");
    expect(statuses["ingredient-completeness"]).toBe("pass");

    const passCount = gates.filter((g) => g.status === "pass").length;
    const failCount = gates.filter((g) => g.status === "fail").length;
    expect(passCount).toBe(3);
    expect(failCount).toBe(3);
  });

  test("seeded corpus with data changes gate statuses", () => {
    // Build a corpus that passes all 6 gates
    const corpus = {
      mixtures: [] as { slug: string; kind?: string; regions: string[] }[],
      ingredients: [] as {
        slug: string;
        category: string;
        flavorProfile: string[];
        regions: string[];
        culinaryUse?: string;
        hasImage: boolean;
      }[],
      pairings: [] as { slugs: [string, string] }[],
      recipes: [] as { mixtureRefs: string[] }[],
    };

    // Add 3 mixtures per kind (21 mixtures) with all regions covered
    let regionIdx = 0;
    for (const kind of MIXTURE_KINDS) {
      for (let i = 0; i < 3; i++) {
        const slug = `mixture-${kind}-${i}`;
        corpus.mixtures.push({
          slug,
          kind,
          regions: [REGIONS[regionIdx % REGIONS.length], REGIONS[(regionIdx + 1) % REGIONS.length]],
        });
        regionIdx += 2;
      }
    }

    // Ensure every region has ≥3 entries by adding ingredients
    const regionCounts = new Map<string, number>(REGIONS.map((r) => [r, 0]));
    for (const m of corpus.mixtures) {
      for (const r of m.regions) regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
    }
    let iIdx = 0;
    for (const region of REGIONS) {
      while ((regionCounts.get(region) ?? 0) < 3) {
        corpus.ingredients.push({
          slug: `fill-region-${region}-${iIdx++}`,
          category: INGREDIENT_CATEGORIES[iIdx % INGREDIENT_CATEGORIES.length],
          flavorProfile: ["warm"],
          regions: [region],
          culinaryUse: "Used in cooking",
          hasImage: true,
        });
        regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      }
    }

    // Add 5 ingredients per category (35 ingredients with complete data)
    for (const category of INGREDIENT_CATEGORIES) {
      for (let i = 0; i < 5; i++) {
        corpus.ingredients.push({
          slug: `ingredient-${category}-${i}`,
          category,
          flavorProfile: ["warm"],
          regions: ["north-africa"],
          culinaryUse: "Used in cooking",
          hasImage: true,
        });
      }
    }

    // Add 3 pairings per mixture (well above 3× density)
    const allMixtureSlugs = corpus.mixtures.map((m) => m.slug);
    for (const slug of allMixtureSlugs) {
      for (let i = 0; i < 3; i++) {
        corpus.pairings.push({ slugs: [slug, `ingredient-spice-${i}`] });
      }
    }

    const gates = computeContentGates(corpus);
    const passCount = gates.filter((g) => g.status === "pass").length;
    expect(passCount).toBe(6);
  });
});
