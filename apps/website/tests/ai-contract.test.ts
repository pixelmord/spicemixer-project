import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { InMemoryStore } from "../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../src/lib/meta-sidecar.ts";
import type { AiEvent } from "@pixelmord/content-ai-core";
import { hashContent } from "@pixelmord/content-ai-core";

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

// ── Contract 1: No kind-allowlist references ─────────────────────────────────
// Auto-apply gating must use FieldConfig.autoApply (single source of truth).
// The deleted kind-allowlist symbols must not reappear.

const ALLOWLIST_SYMBOLS = /\b(isAllowedAutoApply|assertAutoApplyAllowed|AutoApplyKind|ALLOWLIST)\b/;

describe("ai-contract: kind-allowlist symbols must not appear in website src", () => {
  test("no file in apps/website/src references deleted kind-allowlist symbols", async () => {
    const violations: string[] = [];

    for await (const filePath of walkSrc(SRC_ROOT)) {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (ALLOWLIST_SYMBOLS.test(lines[i])) {
          violations.push(`${relative(WEBSITE_ROOT, filePath)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Kind-allowlist symbols found (use FieldConfig.autoApply instead):\n${violations.join("\n")}`,
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

vi.mock("recipe-ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recipe-ingestion")>();
  return { ...actual, fetchRecipe: vi.fn() };
});

// Stub every AI-provider call to avoid network requests in unit tests.
vi.mock("@/lib/ai/extract-recipe.ts", () => ({
  extractRecipeFromFile: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/ai/extract-ingredient.ts", () => ({
  extractIngredientFromFile: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/ai/extract-pairing.ts", () => ({
  extractPairingFromFile: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/ai/generate-recipe.ts", () => ({
  generateRecipeFromPrompt: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/ai/merge-recipe.ts", () => ({
  mergeRecipe: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/ai/merge-ingredient.ts", () => ({
  mergeIngredient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/ai/merge-pairing.ts", () => ({
  mergePairing: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/search-images.ts", () => ({
  searchImages: vi.fn().mockResolvedValue([]),
}));

// Stub wrapWithOrigin to run handlers inside a fixed origin context so traceId is available.
vi.mock("@pixelmord/content-ai-core/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pixelmord/content-ai-core/server")>();
  return {
    ...actual,
    wrapWithOrigin:
      (meta: unknown) =>
      <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
      (...args: A): Promise<R> =>
        actual.withOrigin(
          { ...(meta as object), runId: "test-run-id" } as Parameters<typeof actual.withOrigin>[0],
          () => fn(...args),
        ),
  };
});

// Stub runRefine (@pixelmord/content-ai-refine) to avoid network calls in integration tests.
vi.mock("@pixelmord/content-ai-refine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pixelmord/content-ai-refine")>();
  return {
    ...actual,
    runRefine: vi.fn().mockResolvedValue({
      suggestions: new Map(),
      autoApplied: new Map(),
      traces: new Map(),
    }),
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
      endpoints: [
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

  test("saveRecipe with traceId stamps it on the accepted aiEvent", async () => {
    const handler = await getHandler("saveRecipe");
    await handler({
      collection: "recipes",
      slug: "cardamom-rice",
      locale: "en",
      recipe: { name: "Cardamom Rice" },
      aiMergeModel: "gpt-4",
      traceId: "trace-abc",
    });

    const meta = await sidecar.read({ collection: "recipes", locale: "en", slug: "cardamom-rice" });
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(aiEvents[0].traceId).toBe("trace-abc");
  });

  test("saveIngredient with traceId stamps it on the accepted aiEvent", async () => {
    const handler = await getHandler("saveIngredient");
    await handler({
      locale: "en",
      slug: "cumin",
      ingredient: { name: "Cumin" },
      aiMergeModel: "gpt-4",
      traceId: "trace-def",
    });

    const meta = await sidecar.read({ collection: "ingredients", locale: "en", slug: "cumin" });
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(aiEvents[0].traceId).toBe("trace-def");
  });

  test("savePairing with traceId stamps it on the accepted aiEvent", async () => {
    const handler = await getHandler("savePairing");
    await handler({
      id: "cardamom--cumin",
      endpoints: [
        { collection: "ingredients" as const, slug: "cardamom" },
        { collection: "ingredients" as const, slug: "cumin" },
      ],
      description: "Fragrant combo",
      locale: "en",
      aiMergeModel: "gpt-4",
      traceId: "trace-ghi",
    });

    const meta = await sidecar.read({ collection: "pairings", slug: "cardamom--cumin" });
    const aiEvents = (meta!.data as Record<string, unknown>).aiEvents as AiEvent[];
    expect(aiEvents[0].traceId).toBe("trace-ghi");
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
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map(),
      autoApplied: new Map([
        [
          "language",
          { value: "en", hash: "h1", summary: "language: en", confidence: "high" as const },
        ],
      ]),
      traces: new Map(),
    });

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
    // auto-applied events must carry a traceId (runId from origin envelope)
    expect(aiEvents!.filter((e) => e.type === "auto-applied").every((e) => !!e.traceId)).toBe(true);
  });

  test("aiRefreshIngredientSuggestions writes a pairing to the store and records an aiEvent when auto-apply fires", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "pairings",
          {
            kind: "single" as const,
            value: [
              {
                otherCollection: "ingredients",
                otherSlug: "cumin",
                rationale: "Fragrant pair",
                confidence: "high" as const,
              },
            ],
            confidence: "high" as const,
            summary: "pairings: [1 items]",
            hash: "abc123",
            traceId: "trace-1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
    });

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
    // Verify the pairing uses the new endpoints shape
    const pairingData = pairing?.data as Record<string, unknown>;
    expect(pairingData["endpoints"], "auto-applied pairing must use endpoints field").toBeDefined();

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
// Cache and write logic now lives in the runner module (issue #64).

const RUNNER_FILE = join(SRC_ROOT, "lib", "ai", "runner.ts");

describe("ai-contract: aiRefreshSuggestions cache-hit must not write meta sidecar", () => {
  test("runner delegates cache check to eventLog.shouldSkip and returns cached: true on skip", async () => {
    const content = await readFile(RUNNER_FILE, "utf-8");
    const region = extractRegion(
      content,
      "async function runRecipeRefresh(",
      "\nasync function runPairingRefresh(",
    );
    expect(region, "runRecipeRefresh region not found").not.toBe("");
    // The early-return path — if removed, the second call always runs AI again
    expect(region).toContain("cached: true");
    // Fingerprint + force logic is delegated to eventLog.checkFingerprint
    expect(region).toContain("eventLog.checkFingerprint(");
    // The skip guard must be present
    expect(region).toContain("skipResult.skip");
  });

  test("runner sidecar write is guarded by stripTimestamp content-hash comparison", async () => {
    const content = await readFile(RUNNER_FILE, "utf-8");
    const region = extractRegion(
      content,
      "async function runRecipeRefresh(",
      "export async function runAiRefresh(",
    );
    expect(region, "runRecipeRefresh region not found").not.toBe("");
    // stripTimestamp must exist — its removal means at timestamp differences trigger writes
    expect(region).toContain("stripTimestamp");
    // at field must be zeroed so identical runs with a fresh timestamp are a no-op
    expect(region).toMatch(/at:\s*""/);
    // The write must be inside a conditional block, not unconditional
    const writeIdx = region.indexOf("sidecar.write(");
    expect(writeIdx, "sidecar.write( not found in runner").toBeGreaterThan(-1);
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
