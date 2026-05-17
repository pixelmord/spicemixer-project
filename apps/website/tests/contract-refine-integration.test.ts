import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { FieldSuggestion } from "@pixelmord/content-ai-refine";

vi.mock("@pixelmord/content-ai-refine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pixelmord/content-ai-refine")>();
  return {
    ...actual,
    runRefine: vi.fn().mockResolvedValue({
      suggestions: new Map<string, FieldSuggestion>(),
      autoApplied: new Map<string, unknown>(),
      traces: new Map(),
    }),
  };
});

vi.mock("content-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("content-ai")>();
  return {
    ...actual,
    translateIngredientFields: vi.fn().mockResolvedValue({ targetLocale: "de", fields: {} }),
    translateRecipeFields: vi.fn().mockResolvedValue({ targetLocale: "de", fields: {} }),
    translatePairingDescription: vi.fn().mockResolvedValue({ targetLocale: "de", fields: {} }),
    extractRecipeFromFile: vi.fn().mockResolvedValue({}),
    extractIngredientFromFile: vi.fn().mockResolvedValue({}),
    extractPairingFromFile: vi.fn().mockResolvedValue({}),
    generateRecipeFromPrompt: vi.fn().mockResolvedValue({}),
    mergeRecipe: vi.fn().mockResolvedValue({}),
    mergeIngredient: vi.fn().mockResolvedValue({}),
    mergePairing: vi.fn().mockResolvedValue({}),
    searchImages: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("astro:actions", () => ({
  defineAction: (opts: { handler: unknown; input?: unknown; accept?: string }) => opts,
  ActionError: class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("astro/zod", async () => {
  const zod = await import("zod");
  return { z: zod.z };
});

vi.mock("astro:content", () => ({
  getEntry: vi.fn().mockResolvedValue(null),
  getCollection: vi.fn().mockResolvedValue([]),
}));

vi.mock("recipe-ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recipe-ingestion")>();
  return { ...actual, fetchRecipe: vi.fn() };
});

import { InMemoryStore } from "../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../src/lib/meta-sidecar.ts";
import { createAiEventLog } from "content-ai";
import { runAiRefresh } from "../src/lib/ai/runner.ts";
import { recipeContract } from "../src/contracts/recipeContract.ts";
import { ingredientContract } from "../src/contracts/ingredientContract.ts";
import { pairingContract } from "../src/contracts/pairingContract.ts";
import type { AiConfig } from "content-ai";

const CONFIG: AiConfig = { model: "gpt-4o-mini", apiKey: "test", baseUrl: "http://localhost" };

function makeEnv() {
  const store = new InMemoryStore();
  const sidecar = createMetaSidecar(store);
  const eventLog = createAiEventLog(sidecar);
  return { store, sidecar, eventLog };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recipeContract field configs", () => {
  const recipe = {
    name: "Cardamom Rice",
    recipeCategory: "Side Dish",
    recipeCuisine: "Indian",
    recipeIngredient: ["cardamom pods", "basmati rice"],
    description: "A fragrant rice dish",
  };
  const ctx = {
    currentData: recipe,
    sourceContext: undefined,
    userPrompt: undefined,
    preset: undefined,
  };

  test("description field generates a system prompt containing recipe context", () => {
    const prompt = recipeContract.fields.description.systemPrompt!(ctx as never);
    expect(prompt).toContain("Cardamom Rice");
    expect(prompt).toContain("Side Dish");
    expect(prompt).toContain("description");
  });

  test("description field has never auto-apply policy", () => {
    expect(recipeContract.fields.description.autoApply).toMatchObject({ policy: "never" });
  });

  test("description field has replace write policy", () => {
    expect(recipeContract.fields.description.writePolicy).toBe("replace");
  });

  test("description field opts into expand and summarize presets", () => {
    expect(recipeContract.fields.description.presetIds).toContain("expand");
    expect(recipeContract.fields.description.presetIds).toContain("summarize");
  });

  test("language field auto-applies at threshold 0.0", () => {
    expect(recipeContract.fields.language.autoApply).toMatchObject({
      policy: "high-confidence",
      threshold: 0.0,
    });
  });

  test("language field has fill-if-empty write policy", () => {
    expect(recipeContract.fields.language.writePolicy).toBe("fill-if-empty");
  });

  test("keywords field generates a prompt containing tag vocabulary hint when tags provided", () => {
    const ctxWithTags = {
      ...ctx,
      sourceContext: { existingTags: ["spicy", "quick-dinner", "vegetarian"] },
    };
    const prompt = recipeContract.fields.keywords.systemPrompt!(ctxWithTags as never);
    expect(prompt).toContain("spicy");
  });

  test("ingredientLinks field generates empty string when inventory is empty", () => {
    const ctxNoInventory = { ...ctx, sourceContext: { inventory: [] } };
    const prompt = recipeContract.fields.ingredientLinks.systemPrompt!(ctxNoInventory as never);
    expect(prompt).toBe("");
  });

  test("presets list contains expand and summarize with correct appliesTo", () => {
    const expand = recipeContract.presets.find((p) => p.id === "expand");
    const summarize = recipeContract.presets.find((p) => p.id === "summarize");
    expect(expand).toBeDefined();
    expect(expand?.appliesTo).toBe("text");
    expect(summarize).toBeDefined();
    expect(summarize?.appliesTo).toBe("text");
  });
});

describe("ingredientContract field configs", () => {
  const ingredient = {
    name: "Cumin",
    category: "Spice",
    flavorNotes: ["earthy", "warm"],
    origin: ["India", "Mexico"],
    summary: "Earthy aromatic seed",
  };
  const ctx = {
    currentData: ingredient,
    sourceContext: undefined,
    userPrompt: undefined,
    preset: undefined,
  };

  test("summary field generates a system prompt with ingredient context", () => {
    const prompt = ingredientContract.fields.summary.systemPrompt!(ctx as never);
    expect(prompt).toContain("Cumin");
    expect(prompt).toContain("summary");
  });

  test("description field generates a system prompt with ingredient context", () => {
    const prompt = ingredientContract.fields.description.systemPrompt!(ctx as never);
    expect(prompt).toContain("Cumin");
    expect(prompt).toContain("description");
  });

  test("language field has fill-if-empty write policy and high-confidence auto-apply", () => {
    expect(ingredientContract.fields.language.writePolicy).toBe("fill-if-empty");
    expect(ingredientContract.fields.language.autoApply).toMatchObject({
      policy: "high-confidence",
      threshold: 0.0,
    });
  });

  test("pairings field generates empty string when inventory is empty", () => {
    const ctxNoInventory = { ...ctx, sourceContext: { inventory: [] } };
    const prompt = ingredientContract.fields.pairings.systemPrompt!(ctxNoInventory as never);
    expect(prompt).toBe("");
  });

  test("pairings field generates prompt containing inventory slugs when inventory provided", () => {
    const ctxWithInventory = {
      ...ctx,
      sourceContext: { inventory: [{ slug: "cardamom", name: "Cardamom" }] },
    };
    const prompt = ingredientContract.fields.pairings.systemPrompt!(ctxWithInventory as never);
    expect(prompt).toContain("cardamom");
  });

  test("text fields opt into expand and summarize presets", () => {
    expect(ingredientContract.fields.summary.presetIds).toContain("expand");
    expect(ingredientContract.fields.description.presetIds).toContain("summarize");
  });

  test("text fields have never auto-apply policy and replace write policy", () => {
    expect(ingredientContract.fields.description.autoApply).toMatchObject({ policy: "never" });
    expect(ingredientContract.fields.description.writePolicy).toBe("replace");
  });
});

describe("pairingContract field configs", () => {
  const pairing = {
    ingredients: ["cardamom", "cumin"],
    description: "Warm, earthy spice blend.",
  };
  const ctx = {
    currentData: pairing,
    sourceContext: undefined,
    userPrompt: undefined,
    preset: undefined,
  };

  test("description field generates a system prompt with ingredient names", () => {
    const prompt = pairingContract.fields.description.systemPrompt!(ctx as never);
    expect(prompt).toContain("cardamom");
    expect(prompt).toContain("cumin");
  });

  test("description field has never auto-apply policy", () => {
    expect(pairingContract.fields.description.autoApply).toMatchObject({ policy: "never" });
  });

  test("description field has replace write policy", () => {
    expect(pairingContract.fields.description.writePolicy).toBe("replace");
  });

  test("locale is reflected in systemPrompt via sourceContext", () => {
    const ctxDe = { ...ctx, sourceContext: { locale: "de" } };
    const prompt = pairingContract.fields.description.systemPrompt!(ctxDe as never);
    expect(prompt).toContain("de");
  });

  test("expand preset appends instruction to description via presetIds", () => {
    expect(pairingContract.fields.description.presetIds).toContain("expand");
  });

  test("presets list contains expand with text appliesTo", () => {
    const expand = pairingContract.presets.find((p) => p.id === "expand");
    expect(expand).toBeDefined();
    expect(expand?.appliesTo).toBe("text");
  });
});

describe("recipeContract: end-to-end runAiRefresh flow", () => {
  test("runAiRefresh writes aiSuggestions to sidecar with recipe fields", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "description",
          {
            kind: "single" as const,
            value: "Fragrant basmati rice with cardamom.",
            confidence: "medium" as const,
            summary: "description: Fragrant basmati rice with cardamom.",
            hash: "abc123",
            traceId: "trace-recipe-1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map([
        ["trace-recipe-1", { traceId: "trace-recipe-1", model: "gpt-4o-mini", runtimeMs: 120 }],
      ]),
    });

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "cardamom-rice" };

    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload: { name: "Cardamom Rice", recipeIngredient: ["cardamom", "basmati rice"] },
      missingFields: ["description"],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    expect(result.cached).toBe(false);
    expect(result.skipped).toBe(false);

    const meta = await sidecar.read(metaRef);
    expect(meta).not.toBeNull();
    const data = meta!.data as Record<string, unknown>;
    expect(data["aiSuggestions"]).toBeDefined();

    expect(vi.mocked(refine.runRefine)).toHaveBeenCalled();
    const [callArgs] = vi.mocked(refine.runRefine).mock.calls;
    expect(callArgs[0]).toHaveProperty("contract");
  });
});

describe("ingredientContract: end-to-end runAiRefresh flow", () => {
  test("runAiRefresh returns improvements from ingredientContract field suggestions", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "summary",
          {
            kind: "single" as const,
            value: "Cumin is a warm, earthy spice.",
            confidence: "medium" as const,
            summary: "summary: Cumin is a warm, earthy spice.",
            hash: "def456",
            traceId: "trace-ingredient-1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map([
        [
          "trace-ingredient-1",
          { traceId: "trace-ingredient-1", model: "gpt-4o-mini", runtimeMs: 90 },
        ],
      ]),
    });

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "ingredients" as const, locale: "en", slug: "cumin" };

    const result = await runAiRefresh({
      kind: "ingredient",
      metaRef,
      payload: { name: "Cumin", category: "Spice" },
      missingFields: ["summary"],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
    });

    expect(result.skipped).toBe(false);
    expect(result.autoLinked).toBe(0);

    const aiSuggs = result.aiSuggestions as {
      improvements: Array<{ field: string; suggestion: unknown }>;
    };
    expect(aiSuggs.improvements).toBeDefined();
    const summaryImprovement = aiSuggs.improvements.find((i) => i.field === "summary");
    expect(summaryImprovement).toBeDefined();
    expect(summaryImprovement?.suggestion).toBe("Cumin is a warm, earthy spice.");

    expect(vi.mocked(refine.runRefine)).toHaveBeenCalled();
    const [callArgs] = vi.mocked(refine.runRefine).mock.calls;
    expect(callArgs[0]).toHaveProperty("contract");
  });
});

describe("pairingContract: end-to-end runAiRefresh flow", () => {
  test("runAiRefresh returns locale-keyed improvements from pairingContract description field", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "description",
          {
            kind: "single" as const,
            value: "Cardamom and cumin unite floral and earthy notes.",
            confidence: "medium" as const,
            summary: "description: Cardamom and cumin unite floral and earthy notes.",
            hash: "ghi789",
            traceId: "trace-pairing-1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map([
        ["trace-pairing-1", { traceId: "trace-pairing-1", model: "gpt-4o-mini", runtimeMs: 100 }],
      ]),
    });

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "pairings" as const, slug: "cardamom--cumin" };

    const result = await runAiRefresh({
      kind: "pairing",
      metaRef,
      payload: {
        descriptions: { en: "Earthy and warm" },
        ingredients: [
          { collection: "ingredients", slug: "cardamom" },
          { collection: "ingredients", slug: "cumin" },
        ],
      },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
    });

    expect(result.skipped).toBe(false);
    expect(result.autoLinked).toBe(0);

    const aiSuggs = result.aiSuggestions as Record<string, { improvements: unknown[] }>;
    expect(aiSuggs["en"]).toBeDefined();
    expect(aiSuggs["en"].improvements.length).toBeGreaterThan(0);

    expect(vi.mocked(refine.runRefine)).toHaveBeenCalled();
    const [callArgs] = vi.mocked(refine.runRefine).mock.calls;
    expect(callArgs[0]).toHaveProperty("contract");
  });
});
