import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { InMemoryStore } from "../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../src/lib/meta-sidecar.ts";
import type { AiEvent } from "content-ai";

// Contract tests ensuring AI policy is enforced centrally (ADR 0004 / PRD #4).

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_ROOT = join(WEBSITE_ROOT, "src");

async function* walkSrc(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSrc(full);
    } else if (/\.(ts|tsx|astro)$/.test(entry.name)) {
      yield full;
    }
  }
}

// ── Contract 1: No inline confidence equality checks ─────────────────────────
// All auto-apply gating must go through isAllowedAutoApply in packages/content-ai.

const INLINE_CONFIDENCE_GATE =
  /confidence\s*===\s*["'](high|medium|low)["']|confidence\s*>=\s*0?\.\d+/;

describe("ai-contract: no inline confidence gates in website src", () => {
  test("no file in apps/website/src contains inline confidence equality/numeric checks", async () => {
    const violations: string[] = [];

    for await (const filePath of walkSrc(SRC_ROOT)) {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (INLINE_CONFIDENCE_GATE.test(lines[i])) {
          violations.push(`${relative(WEBSITE_ROOT, filePath)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Inline confidence checks found (use isAllowedAutoApply instead):\n${violations.join("\n")}`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ── Contract 2: AI action handlers with writes also persist an aiEvent ────────
// Behavioural tests: call each handler with a stubbed store and assert the
// observable side-effect (aiEvents shape in the persisted meta sidecar).
// Replaces the previous source-grep assertions, which were fragile to refactors
// that preserved semantics while changing the literal code text (ADR 0004).

// --- Module stubs (hoisted by Vitest) ---

let mockStore: InMemoryStore;

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

vi.mock("../src/lib/content-store.ts", () => ({
  createStore: async () => mockStore,
}));

vi.mock("recipe-ingestion", () => ({
  fetchRecipe: vi.fn(),
}));

// content-ai is a workspace package whose dist/ is not built during tests.
// vite.config.ts aliases "content-ai" → src/index.ts so imports resolve.
// Keep pure event/hashing utilities real; stub every AI-provider call to
// avoid network requests in unit tests.
vi.mock("content-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("content-ai")>();
  return {
    recordAiEvent: actual.recordAiEvent,
    hashSuggestion: actual.hashSuggestion,
    hashContent: actual.hashContent,
    buildRejectedContext: actual.buildRejectedContext,
    isAllowedAutoApply: actual.isAllowedAutoApply,
    assertAutoApplyAllowed: actual.assertAutoApplyAllowed,
    proposeRecipeImprovements: vi.fn().mockResolvedValue({ fields: [] }),
    proposeTags: vi.fn().mockResolvedValue({ tags: [] }),
    proposeIngredientLinks: vi.fn().mockResolvedValue([]),
    proposeRelations: vi.fn().mockResolvedValue([]),
    detectLanguage: vi.fn().mockResolvedValue(null),
    proposeIngredientImprovements: vi.fn().mockResolvedValue({ fields: [] }),
    proposeIngredientPairings: vi.fn().mockResolvedValue([]),
    proposeIngredientTranslation: vi.fn().mockResolvedValue({ fields: {} }),
    proposeRecipeTranslation: vi.fn().mockResolvedValue({ fields: {} }),
    proposePairingImprovements: vi.fn().mockResolvedValue({ fields: [] }),
    proposePairingTranslation: vi.fn().mockResolvedValue({ fields: {} }),
    extractRecipeFromFile: vi.fn().mockResolvedValue({}),
    extractIngredientFromFile: vi.fn().mockResolvedValue({}),
    extractPairingFromFile: vi.fn().mockResolvedValue({}),
    generateRecipeFromPrompt: vi.fn().mockResolvedValue({}),
    mergeRecipe: vi.fn().mockResolvedValue({}),
    mergeIngredient: vi.fn().mockResolvedValue({}),
    mergePairing: vi.fn().mockResolvedValue({}),
    searchImages: vi.fn().mockResolvedValue([]),
    proposeSlug: vi.fn().mockResolvedValue({ slug: "test-slug" }),
  };
});

describe("ai-contract: AI action handlers with writes also persist an aiEvent", () => {
  // Use a fresh in-memory store per test so writes don't bleed across.
  beforeEach(() => {
    mockStore = new InMemoryStore();
    process.env["AI_API_KEY"] = "test-api-key";
  });

  test("saveRecipe with aiMergeModel writes an accepted aiEvent to the meta sidecar", async () => {
    const { server } = await import("../src/actions/index.ts");
    const handler = (server.saveRecipe as unknown as { handler: Function }).handler;

    await handler({
      collection: "recipes",
      slug: "cardamom-rice",
      locale: "en",
      recipe: { name: "Cardamom Rice" },
      aiMergeModel: "gpt-4",
    });

    const sidecar = createMetaSidecar(mockStore);
    const meta = await sidecar.read({
      collection: "recipes",
      locale: "en",
      slug: "cardamom-rice",
    });
    expect(meta, "meta sidecar must be written when aiMergeModel is provided").not.toBeNull();
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(Array.isArray(aiEvents), "aiEvents must be an array").toBe(true);
    expect(aiEvents.length, "at least one aiEvent must be recorded").toBeGreaterThan(0);
    expect(aiEvents[0].type).toBe("accepted");
    expect(aiEvents[0].model).toBe("gpt-4");
  });

  test("saveIngredient with aiMergeModel writes an accepted aiEvent to the meta sidecar", async () => {
    const { server } = await import("../src/actions/index.ts");
    const handler = (server.saveIngredient as unknown as { handler: Function }).handler;

    await handler({
      locale: "en",
      slug: "cumin",
      ingredient: { name: "Cumin" },
      aiMergeModel: "gpt-4",
    });

    const sidecar = createMetaSidecar(mockStore);
    const meta = await sidecar.read({
      collection: "ingredients",
      locale: "en",
      slug: "cumin",
    });
    expect(meta, "meta sidecar must be written when aiMergeModel is provided").not.toBeNull();
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(Array.isArray(aiEvents), "aiEvents must be an array").toBe(true);
    expect(aiEvents.length, "at least one aiEvent must be recorded").toBeGreaterThan(0);
    expect(aiEvents[0].type).toBe("accepted");
    expect(aiEvents[0].model).toBe("gpt-4");
  });

  test("savePairing with aiMergeModel writes an accepted aiEvent to the pairing meta sidecar", async () => {
    const { server } = await import("../src/actions/index.ts");
    const handler = (server.savePairing as unknown as { handler: Function }).handler;

    // Pre-populate the store with the pairing (savePairing reads existing before writing meta)
    const ingA = { collection: "ingredients" as const, slug: "cardamom" };
    const ingB = { collection: "ingredients" as const, slug: "cumin" };

    await handler({
      id: "cardamom--cumin",
      ingredients: [ingA, ingB],
      description: "Fragrant combo",
      locale: "en",
      aiMergeModel: "gpt-4",
    });

    const sidecar = createMetaSidecar(mockStore);
    const meta = await sidecar.read({ collection: "pairings", slug: "cardamom--cumin" });
    expect(
      meta,
      "pairing meta sidecar must be written when aiMergeModel is provided",
    ).not.toBeNull();
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(Array.isArray(aiEvents), "aiEvents must be an array").toBe(true);
    expect(aiEvents.length, "at least one aiEvent must be recorded").toBeGreaterThan(0);
    expect(aiEvents[0].type).toBe("accepted");
    expect(aiEvents[0].model).toBe("gpt-4");
  });

  test("aiRefreshSuggestions writes aiSuggestions to the meta sidecar", async () => {
    const { server } = await import("../src/actions/index.ts");
    const handler = (server.aiRefreshSuggestions as unknown as { handler: Function }).handler;

    await handler({
      collection: "recipes",
      slug: "cardamom-rice",
      locale: "en",
      recipe: { name: "Cardamom Rice" },
      meta: {},
      missingFields: [],
      force: true,
    });

    const sidecar = createMetaSidecar(mockStore);
    const meta = await sidecar.read({
      collection: "recipes",
      locale: "en",
      slug: "cardamom-rice",
    });
    expect(meta, "meta sidecar must be written after refresh").not.toBeNull();
    const data = meta!.data as Record<string, unknown>;
    expect(data["aiSuggestions"], "aiSuggestions cache must be persisted").toBeDefined();
  });

  test("aiRefreshSuggestions records an aiEvent when auto-apply fires", async () => {
    // Override detectLanguage to trigger language auto-apply (no existing language in meta).
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.detectLanguage).mockResolvedValue({ language: "en" } as never);

    const { server } = await import("../src/actions/index.ts");
    const handler = (server.aiRefreshSuggestions as unknown as { handler: Function }).handler;

    await handler({
      collection: "recipes",
      slug: "cardamom-rice",
      locale: "en",
      recipe: { name: "Cardamom Rice" },
      meta: {}, // no language field → auto-apply will fire for language detection
      missingFields: [],
      force: true,
    });

    const sidecar = createMetaSidecar(mockStore);
    const meta = await sidecar.read({
      collection: "recipes",
      locale: "en",
      slug: "cardamom-rice",
    });
    expect(meta, "meta sidecar must be written after refresh").not.toBeNull();
    const data = meta!.data as Record<string, unknown>;
    const aiEvents = data["aiEvents"] as AiEvent[] | undefined;
    expect(Array.isArray(aiEvents), "aiEvents must be an array when auto-apply fires").toBe(true);
    expect(aiEvents!.length, "at least one aiEvent must be recorded").toBeGreaterThan(0);
    expect(aiEvents!.some((e) => e.type === "auto-applied")).toBe(true);
  });

  test("aiRefreshIngredientSuggestions writes a pairing to the store and records an aiEvent when auto-apply fires", async () => {
    // Stub proposeIngredientPairings to return a high-confidence pairing — this
    // triggers the auto-apply path (store.put("pairings", ...) + recordAiEvent).
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposeIngredientPairings).mockResolvedValue([
      { slug: "cumin", description: "Fragrant pair", confidence: "high" } as never,
    ]);

    // Pre-populate the inventory so the handler has something to pair with.
    await mockStore.put("ingredients", "en/cumin", { name: "Cumin" });

    const { server } = await import("../src/actions/index.ts");
    const handler = (server.aiRefreshIngredientSuggestions as unknown as { handler: Function })
      .handler;

    await handler({
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom" },
      existingMeta: {},
      missingFields: [],
    });

    // Write contract: auto-applied pairing must exist in the pairings collection.
    const pairing = await mockStore.get("pairings", "cardamom--cumin");
    expect(pairing, "auto-applied pairing must be written to the store").not.toBeNull();

    // Event contract: aiEvent must be recorded in the ingredient meta sidecar.
    const sidecar = createMetaSidecar(mockStore);
    const meta = await sidecar.read({ collection: "ingredients", locale: "en", slug: "cardamom" });
    expect(meta, "ingredient meta sidecar must be written after auto-apply").not.toBeNull();
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(Array.isArray(aiEvents), "aiEvents must be an array").toBe(true);
    expect(aiEvents.length, "at least one aiEvent must be recorded").toBeGreaterThan(0);
    expect(aiEvents[0].type).toBe("auto-applied");
  });
});
