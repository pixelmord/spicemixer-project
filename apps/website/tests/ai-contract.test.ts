import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { InMemoryStore } from "../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../src/lib/meta-sidecar.ts";
import type { AiEvent } from "content-ai";
import { hashContent } from "../../../packages/content-ai/src/hash.ts";

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

function extractRegion(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  if (start === -1) return "";
  const end = content.indexOf(endMarker, start);
  return end === -1 ? content.slice(start) : content.slice(start, end);
}

const ACTIONS_FILE = join(SRC_ROOT, "actions", "index.ts");

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
    createAiEventLog: actual.createAiEventLog,
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

async function getHandler(name: string) {
  const { server } = await import("../src/actions/index.ts");
  return (server as unknown as Record<string, { handler: Function }>)[name].handler;
}

describe("ai-contract: AI action handlers with writes also persist an aiEvent", () => {
  let sidecar: ReturnType<typeof createMetaSidecar>;

  beforeEach(() => {
    mockStore = new InMemoryStore();
    sidecar = createMetaSidecar(mockStore);
    process.env["AI_API_KEY"] = "test-api-key";
  });

  test("saveRecipe with aiMergeModel writes an accepted aiEvent to the meta sidecar", async () => {
    const handler = await getHandler("saveRecipe");
    await handler({
      collection: "recipes",
      slug: "cardamom-rice",
      locale: "en",
      recipe: { name: "Cardamom Rice" },
      aiMergeModel: "gpt-4",
    });

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
    const handler = await getHandler("saveIngredient");
    await handler({
      locale: "en",
      slug: "cumin",
      ingredient: { name: "Cumin" },
      aiMergeModel: "gpt-4",
    });

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
    const handler = await getHandler("savePairing");
    await handler({
      id: "cardamom--cumin",
      ingredients: [
        { collection: "ingredients" as const, slug: "cardamom" },
        { collection: "ingredients" as const, slug: "cumin" },
      ],
      description: "Fragrant combo",
      locale: "en",
      aiMergeModel: "gpt-4",
    });

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
    const handler = await getHandler("aiRefreshSuggestions");
    await handler({
      collection: "recipes",
      slug: "cardamom-rice",
      locale: "en",
      recipe: { name: "Cardamom Rice" },
      meta: {},
      missingFields: [],
      force: true,
    });

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.detectLanguage).mockResolvedValue({ language: "en" } as never);

    const handler = await getHandler("aiRefreshSuggestions");
    await handler({
      collection: "recipes",
      slug: "cardamom-rice",
      locale: "en",
      recipe: { name: "Cardamom Rice" },
      meta: {},
      missingFields: [],
      force: true,
    });

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposeIngredientPairings).mockResolvedValue([
      { slug: "cumin", description: "Fragrant pair", confidence: "high" } as never,
    ]);

    await mockStore.put("ingredients", "en/cumin", { name: "Cumin" });

    const handler = await getHandler("aiRefreshIngredientSuggestions");
    await handler({
      locale: "en",
      slug: "cardamom",
      ingredient: { name: "Cardamom" },
      existingMeta: {},
      missingFields: [],
    });

    const pairing = await mockStore.get("pairings", "cardamom--cumin");
    expect(pairing, "auto-applied pairing must be written to the store").not.toBeNull();

    const meta = await sidecar.read({ collection: "ingredients", locale: "en", slug: "cardamom" });
    expect(meta, "ingredient meta sidecar must be written after auto-apply").not.toBeNull();
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(Array.isArray(aiEvents), "aiEvents must be an array").toBe(true);
    expect(aiEvents.length, "at least one aiEvent must be recorded").toBeGreaterThan(0);
    expect(aiEvents[0].type).toBe("auto-applied");
  });
});

// ── Contract 3: aiRefreshSuggestions cache-hit must not write meta sidecar ───
// Regression guard for the infinite-loop bug: opening /admin/<type>/<slug>/edit
// triggered aiRefreshSuggestions → unconditional sidecar write → Astro glob-
// loader reload → form remount → repeat forever. Two guards prevent this:
// (a) fingerprint early-return skips AI work entirely on a cache hit, and
// (b) content-hash comparison skips the sidecar write when nothing changed.

describe("ai-contract: aiRefreshSuggestions cache-hit must not write meta sidecar", () => {
  test("handler delegates cache check to eventLog.shouldSkip and returns cached: true on skip", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(
      content,
      "aiRefreshSuggestions: defineAction(",
      "\n  aiCreateTranslation:",
    );
    expect(region, "aiRefreshSuggestions region not found").not.toBe("");
    // The early-return path — if removed, the second call always runs AI again
    expect(region).toContain("cached: true");
    // Fingerprint + force logic is delegated to eventLog.shouldSkip
    expect(region).toContain("eventLog.shouldSkip(");
    // The skip guard must be present
    expect(region).toContain("skipResult.skip");
  });

  test("sidecar write is guarded by stripTimestamp content-hash comparison", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(
      content,
      "aiRefreshSuggestions: defineAction(",
      "\n  aiCreateTranslation:",
    );
    expect(region, "aiRefreshSuggestions region not found").not.toBe("");
    // stripTimestamp must exist — its removal means at timestamp differences trigger writes
    expect(region).toContain("stripTimestamp");
    // at field must be zeroed so identical runs with a fresh timestamp are a no-op
    expect(region).toMatch(/at:\s*""/);
    // The write must be inside a conditional block, not unconditional
    const writeIdx = region.indexOf("sidecar.write(");
    expect(writeIdx, "sidecar.write( not found in handler").toBeGreaterThan(-1);
    // The if-guard using stripTimestamp must precede the write
    const beforeWrite = region.slice(0, writeIdx);
    expect(beforeWrite).toContain("stripTimestamp");
  });

  // Runtime: verify the hash invariants the cache relies on.
  test("same recipe inputs produce the same fingerprint (cache is stable)", () => {
    const recipe = { name: "Miso Butter Ramen", recipeIngredient: ["miso", "butter"] };
    const inputs = {
      recipe,
      missingFields: ["description"],
      locale: "en",
      model: "gpt-4o",
      rejectedHashes: [],
    };
    expect(hashContent(inputs)).toBe(hashContent(inputs));
  });

  test("different recipe produces a different fingerprint (cache is invalidated)", () => {
    const base = {
      recipe: { name: "Ramen" },
      missingFields: [],
      locale: "en",
      model: "gpt-4o",
      rejectedHashes: [],
    };
    const changed = { ...base, recipe: { name: "Udon" } };
    expect(hashContent(base)).not.toBe(hashContent(changed));
  });

  test("stripTimestamp semantics: two metas differing only in at are hash-equal after stripping", () => {
    // Mirrors the stripTimestamp helper in the handler: { ...m, aiSuggestions: { ...cache, at: "" } }
    const stripAt = (m: Record<string, unknown>) => {
      const cache = m["aiSuggestions"] as { at?: string } | undefined;
      return cache ? { ...m, aiSuggestions: { ...cache, at: "" } } : m;
    };
    const meta1 = {
      aiSuggestions: { fingerprint: "abc", at: "2026-01-01T00:00:00Z", data: { tags: [] } },
    };
    const meta2 = {
      aiSuggestions: { fingerprint: "abc", at: "2026-06-01T12:00:00Z", data: { tags: [] } },
    };
    // Without stripping they differ (timestamps are different)
    expect(hashContent(meta1)).not.toBe(hashContent(meta2));
    // After stripping the at field, they must be identical
    expect(hashContent(stripAt(meta1))).toBe(hashContent(stripAt(meta2)));
  });
});
