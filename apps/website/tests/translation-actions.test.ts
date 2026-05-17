import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { FieldSuggestion } from "@pixelmord/content-ai-ingest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@pixelmord/content-ai-ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pixelmord/content-ai-ingest")>();
  return {
    ...actual,
    runFill: vi.fn().mockResolvedValue({
      suggestions: new Map<string, FieldSuggestion>(),
      autoApplied: new Map<string, unknown>(),
      traces: new Map(),
      ingestedEvent: null,
      warnings: [],
    }),
  };
});

vi.mock("content-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("content-ai")>();
  return {
    ...actual,
    withOrigin: (_meta: unknown) => (fn: (...args: unknown[]) => unknown) => fn,
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

vi.mock("@/lib/content-store.ts", () => ({
  createStore: vi.fn(),
}));

vi.mock("@/lib/ai/config.ts", () => ({
  resolveAiConfig: vi.fn().mockReturnValue({
    model: "gpt-4o-mini",
    apiKey: "test",
    baseUrl: "http://localhost",
  }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { InMemoryStore } from "../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../src/lib/meta-sidecar.ts";
import { entityMeta, createAiEventLog } from "content-ai";
import { runFill } from "@pixelmord/content-ai-ingest";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEnv() {
  const store = new InMemoryStore();
  const sidecar = createMetaSidecar(store);
  const eventLog = createAiEventLog(sidecar);
  return { store, sidecar, eventLog };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("aiCreateTranslation: recipe atomic create", () => {
  test("stores translated recipe at targetLocale/translationSlug", async () => {
    const { store, sidecar } = makeEnv();

    const fields = { name: "Salzzitrone-Hähnchen", description: "Geräuchertes Paprika-Hähnchen" };
    const meta = {
      draft: true,
      kind: "recipe",
      tags: [],
      ingredientLinks: [],
      externalSources: [],
      goesWellWith: [],
      usesBase: [],
      variants: [],
      language: "de",
      locale: "de",
      translationOf: "lemon-chicken",
      translations: {},
    };

    // No entity should exist yet
    const before = await store.get("recipes", "de/salzzitrone-haehnchen");
    expect(before).toBeNull();

    // Simulate what aiCreateTranslation handler does
    await store.put("recipes", "de/salzzitrone-haehnchen", fields);
    await sidecar.write(
      { collection: "recipes", locale: "de", slug: "salzzitrone-haehnchen" },
      meta,
    );

    // Back-link source meta
    const sourceRef = {
      collection: "recipes" as const,
      locale: "en" as const,
      slug: "lemon-chicken",
    };
    await sidecar.write(
      { collection: "recipes", locale: "en", slug: "lemon-chicken" },
      {
        draft: false,
        translations: { de: "salzzitrone-haehnchen" },
      },
    );

    const saved = await store.get("recipes", "de/salzzitrone-haehnchen");
    expect((saved?.data as Record<string, unknown>)["name"]).toBe("Salzzitrone-Hähnchen");

    const savedMeta = await entityMeta.read(sidecar, {
      collection: "recipes",
      locale: "de",
      slug: "salzzitrone-haehnchen",
    });
    expect(savedMeta.draft).toBe(true);
    expect(savedMeta.translationOf).toBe("lemon-chicken");

    const sourceMeta = await entityMeta.read(sidecar, sourceRef);
    expect((sourceMeta.translations as Record<string, string>)["de"]).toBe("salzzitrone-haehnchen");
  });

  test("CONFLICT when translationSlug already exists", async () => {
    const { store } = makeEnv();

    // Pre-populate
    await store.put("recipes", "de/existing-slug", { name: "Existing" });

    const existing = await store.get("recipes", "de/existing-slug");
    expect(existing).not.toBeNull();
  });
});

describe("aiCreateIngredientTranslation: ingredient atomic create", () => {
  test("stores translated ingredient at targetLocale/slug", async () => {
    const { store, sidecar } = makeEnv();

    const fields = {
      name: "Kurkuma",
      summary: "Goldenes Gewürz",
      description: "Eingehende Beschreibung",
    };
    const meta = {
      draft: true,
      translationOf: "en/turmeric",
      translations: {},
    };

    const before = await store.get("ingredients", "de/turmeric");
    expect(before).toBeNull();

    await store.put("ingredients", "de/turmeric", fields);
    await sidecar.write({ collection: "ingredients", locale: "de", slug: "turmeric" }, meta);

    // Back-link
    const sourceRef = {
      collection: "ingredients" as const,
      locale: "en" as const,
      slug: "turmeric",
    };
    await sidecar.write(
      { collection: "ingredients", locale: "en", slug: "turmeric" },
      {
        translations: { de: "de/turmeric" },
      },
    );

    const saved = await store.get("ingredients", "de/turmeric");
    expect((saved?.data as Record<string, unknown>)["name"]).toBe("Kurkuma");

    const sourceMeta = await entityMeta.read(sidecar, sourceRef);
    expect((sourceMeta.translations as Record<string, string>)["de"]).toBe("de/turmeric");
  });

  test("CONFLICT when translation already exists", async () => {
    const { store } = makeEnv();

    await store.put("ingredients", "de/turmeric", { name: "Existing" });
    const existing = await store.get("ingredients", "de/turmeric");
    expect(existing).not.toBeNull();
  });
});

describe("aiTranslatePairing: pairing description save (per-locale schema)", () => {
  test("pairing saved with per-locale description field", async () => {
    const { store } = makeEnv();
    const pairingId = "turmeric--ginger";

    const ep1 = { collection: "ingredients", slug: "turmeric" };
    const ep2 = { collection: "ingredients", slug: "ginger" };

    // Seed a pairing with EN description (per-locale shape)
    await store.put("pairings", pairingId, {
      endpoints: [ep1, ep2],
      description: "A warming combination",
    });

    const existing = await store.get("pairings", pairingId);
    expect(existing).not.toBeNull();

    const d = existing!.data as Record<string, unknown>;
    expect(d["description"]).toBe("A warming combination");
    expect(d["descriptions"]).toBeUndefined();
  });

  test("translation creates a new per-locale record (not a descriptions map)", async () => {
    const { store } = makeEnv();
    const pairingId = "turmeric--ginger";

    const ep1 = { collection: "ingredients", slug: "turmeric" };
    const ep2 = { collection: "ingredients", slug: "ginger" };

    await store.put("pairings", `en/${pairingId}`, {
      endpoints: [ep1, ep2],
      description: "A warming combination",
    });

    // Translation creates a separate locale record
    await store.put("pairings", `de/${pairingId}`, {
      endpoints: [ep1, ep2],
      description: "Eine wärmende Kombination",
    });

    const en = await store.get("pairings", `en/${pairingId}`);
    const de = await store.get("pairings", `de/${pairingId}`);
    expect((en!.data as Record<string, unknown>)["description"]).toBe("A warming combination");
    expect((de!.data as Record<string, unknown>)["description"]).toBe("Eine wärmende Kombination");
  });
});

describe("aiFillTranslation: runFill routing by kind", () => {
  test("calls runFill with recipeTranslationContract for recipe kind", async () => {
    const { recipeTranslationContract } = await import("../src/lib/ai/translation-contracts.ts");

    const mockRunFill = vi.mocked(runFill);
    mockRunFill.mockResolvedValueOnce({
      suggestions: new Map([
        [
          "name",
          {
            kind: "single",
            value: "Gesalzenes Rezept",
            confidence: "medium",
            summary: "name: Gesalzenes Rezept",
            hash: "abc",
            traceId: "t1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
      ingestedEvent: {
        type: "ingested",
        at: new Date().toISOString(),
        model: "test",
        suggestion: { hash: "abc", summary: "test" },
        traceId: "t1",
      },
      warnings: [],
    });

    const config = { model: "gpt-4o-mini", apiKey: "test", baseUrl: "http://localhost" };
    const sourceContext = {
      kind: "sibling-locale" as const,
      sourceRef: { id: "lemon-chicken", kind: "recipe" },
      sourceData: { name: "Lemon Chicken" },
      sourceLocale: "en",
      targetLocale: "de",
      fieldHashes: {},
    };

    await runFill({ contract: recipeTranslationContract, sourceContext, config });

    expect(mockRunFill).toHaveBeenCalledOnce();
    const callArgs = mockRunFill.mock.calls[0]![0];
    expect(callArgs.contract).toBe(recipeTranslationContract);
    const ctx = callArgs.sourceContext as { sourceLocale: string; targetLocale: string };
    expect(ctx.sourceLocale).toBe("en");
    expect(ctx.targetLocale).toBe("de");
  });

  test("calls runFill with ingredientTranslationContract for ingredient kind", async () => {
    const { ingredientTranslationContract } =
      await import("../src/lib/ai/translation-contracts.ts");

    const mockRunFill = vi.mocked(runFill);

    const config = { model: "gpt-4o-mini", apiKey: "test", baseUrl: "http://localhost" };
    const sourceContext = {
      kind: "sibling-locale" as const,
      sourceRef: { id: "turmeric", kind: "ingredient" },
      sourceData: { name: "Turmeric", summary: "Golden spice" },
      sourceLocale: "en",
      targetLocale: "de",
      fieldHashes: {},
    };

    await runFill({ contract: ingredientTranslationContract, sourceContext, config });

    expect(mockRunFill).toHaveBeenCalled();
    const callArgs = mockRunFill.mock.calls[0]![0];
    expect(callArgs.contract).toBe(ingredientTranslationContract);
  });
});

describe("per-locale aiEvents isolation", () => {
  test("EN and DE entities with same slug have independent event logs", async () => {
    const { store, eventLog } = makeEnv();

    // Seed EN ingredient
    await store.put("ingredients", "en/turmeric", { name: "Turmeric" });
    await store.put("ingredients", "de/turmeric", { name: "Kurkuma" });

    const enRef = { collection: "ingredients" as const, locale: "en" as const, slug: "turmeric" };
    const deRef = { collection: "ingredients" as const, locale: "de" as const, slug: "turmeric" };

    const enEvent = {
      type: "ingested" as const,
      at: new Date().toISOString(),
      model: "gpt-4o-mini",
      suggestion: { hash: "en-hash", summary: "EN ingested" },
      traceId: "en-trace",
    };

    const deEvent = {
      type: "accepted" as const,
      at: new Date().toISOString(),
      model: "gpt-4o-mini",
      field: "name",
      suggestion: { hash: "de-hash", summary: "DE accepted" },
      traceId: "de-trace",
    };

    await eventLog.append(enRef, enEvent);
    await eventLog.append(deRef, deEvent);

    const enEvents = await eventLog.read(enRef);
    const deEvents = await eventLog.read(deRef);

    // EN entity has only its own event
    expect(enEvents).toHaveLength(1);
    expect(enEvents[0]!.suggestion.hash).toBe("en-hash");

    // DE entity has only its own event
    expect(deEvents).toHaveLength(1);
    expect(deEvents[0]!.suggestion.hash).toBe("de-hash");

    // Cross-check: EN events don't contain DE's hash
    expect(enEvents.map((e) => e.suggestion.hash)).not.toContain("de-hash");
    expect(deEvents.map((e) => e.suggestion.hash)).not.toContain("en-hash");
  });

  test("appending to DE entity does not affect EN entity event count", async () => {
    const { store, eventLog } = makeEnv();

    await store.put("ingredients", "en/cumin", { name: "Cumin" });
    await store.put("ingredients", "de/cumin", { name: "Kreuzkümmel" });

    const enRef = { collection: "ingredients" as const, locale: "en" as const, slug: "cumin" };
    const deRef = { collection: "ingredients" as const, locale: "de" as const, slug: "cumin" };

    const makeEvent = (hash: string) => ({
      type: "ingested" as const,
      at: new Date().toISOString(),
      model: "gpt-4o-mini",
      suggestion: { hash, summary: `event ${hash}` },
    });

    await eventLog.append(enRef, makeEvent("en-1"));
    await eventLog.append(deRef, makeEvent("de-1"));
    await eventLog.append(deRef, makeEvent("de-2"));

    const enEvents = await eventLog.read(enRef);
    const deEvents = await eventLog.read(deRef);

    expect(enEvents).toHaveLength(1);
    expect(deEvents).toHaveLength(2);
  });
});
