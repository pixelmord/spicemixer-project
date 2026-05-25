import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { InMemoryStore } from "../../../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../../../src/lib/meta-sidecar.ts";
import { runAiRefresh } from "../../../src/lib/ai/runner.ts";
import type { AiConfig } from "@pixelmord/content-ai-core";
import { hashContent } from "@pixelmord/content-ai-core";
import { withOrigin } from "@pixelmord/content-ai-core/server";
import { createAiEventLog } from "../../../src/lib/sidecar-event-log.ts";
import { subscribe } from "../../../src/lib/pubsub.ts";
import type { PubSubEvent } from "../../../src/lib/pubsub.ts";
import type { FieldSuggestion } from "@pixelmord/content-ai-refine";

// Stub runRefine to avoid network calls; keep real event/hash utilities.
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

const CONFIG: AiConfig = { model: "gpt-4o", apiKey: "test", baseUrl: "https://api.test" };

function makeEnv() {
  const store = new InMemoryStore();
  const sidecar = createMetaSidecar(store);
  const eventLog = createAiEventLog(sidecar);
  return { store, sidecar, eventLog };
}

// ── Recipe kind: fingerprint cache ────────────────────────────────────────────

describe("runAiRefresh recipe: fingerprint cache", () => {
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    env = makeEnv();
  });

  test("cache miss: returns fresh suggestions and writes aiSuggestions to sidecar", async () => {
    const { store, sidecar, eventLog } = env;
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };

    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload: { name: "Miso Ramen" },
      missingFields: [],
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
  });

  test("cache hit: returns cached suggestion without re-running LLM", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    const { store, sidecar, eventLog } = env;
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };
    const payload = { name: "Miso Ramen" };

    // First call — populates the cache.
    await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload,
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    vi.mocked(refine.runRefine).mockClear();

    // Second call — same payload, no force flag → cache hit.
    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload,
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
    });

    expect(result.cached).toBe(true);
    expect(vi.mocked(refine.runRefine)).not.toHaveBeenCalled();
  });

  test("force=true bypasses cache and re-runs LLM", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    const { store, sidecar, eventLog } = env;
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };
    const payload = { name: "Miso Ramen" };

    // Populate the cache.
    await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload,
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    vi.mocked(refine.runRefine).mockClear();

    // force=true bypasses the cache.
    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload,
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    expect(result.cached).toBe(false);
    expect(vi.mocked(refine.runRefine)).toHaveBeenCalled();
  });

  test("cache is invalidated when payload changes", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    const { store, sidecar, eventLog } = env;
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };

    await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload: { name: "Miso Ramen" },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    vi.mocked(refine.runRefine).mockClear();

    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload: { name: "Miso Ramen Updated" },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
    });

    expect(result.cached).toBe(false);
    expect(vi.mocked(refine.runRefine)).toHaveBeenCalled();
  });

  test("language-mismatch: detectedLanguage returned when content language differs from locale", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map(),
      autoApplied: new Map([
        [
          "language",
          { value: "de", hash: "h1", summary: "language: de", confidence: "high" as const },
        ],
      ]),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = env;
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "schnitzel" };

    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload: { name: "Wiener Schnitzel" },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    expect(result.detectedLanguage).toBe("de");
  });

  // Regression guard (ADR 0004 / issue #49): cache-hit must not write sidecar.
  test("cache hit must not write the meta sidecar", async () => {
    const { store, sidecar, eventLog } = env;
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };
    const payload = { name: "Miso Ramen" };

    // First call writes the sidecar.
    await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload,
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    const after1 = await sidecar.read(metaRef);
    const at1 = ((after1!.data as Record<string, unknown>)["aiSuggestions"] as { at: string }).at;

    // Second call — cache hit, no new write.
    await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload,
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
    });

    const after2 = await sidecar.read(metaRef);
    const at2 = ((after2!.data as Record<string, unknown>)["aiSuggestions"] as { at: string }).at;
    // Cache hit means no write — timestamp unchanged.
    expect(at1).toBe(at2);
  });
});

// ── Recipe kind: auto-apply ───────────────────────────────────────────────────

describe("runAiRefresh recipe: auto-apply ingredient links", () => {
  test("auto-applies high-confidence ingredient links and records aiEvent", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "ingredientLinks",
          {
            kind: "single" as const,
            value: [{ pattern: "miso", slug: "miso", confidence: "high" as const }],
            confidence: "high" as const,
            summary: "ingredientLinks: [1 items]",
            hash: "abc123",
            traceId: "trace-1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = makeEnv();
    await store.put("ingredients", "en/miso", { name: "Miso" });

    const metaRef = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };

    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload: { name: "Miso Ramen", recipeIngredient: ["miso paste"] },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    expect(result.autoLinked).toBeGreaterThan(0);
    expect(result.autoAppliedLinks).toContain("miso");

    const meta = await sidecar.read(metaRef);
    const aiEvents = (meta!.data as Record<string, unknown>)["aiEvents"] as Array<unknown>;
    expect(aiEvents?.some((e: unknown) => (e as { type: string }).type === "auto-applied")).toBe(
      true,
    );
  });

  test("low-confidence ingredient links are not auto-applied", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "ingredientLinks",
          {
            kind: "single" as const,
            value: [{ pattern: "miso", slug: "miso", confidence: "low" as const }],
            confidence: "low" as const,
            summary: "ingredientLinks: [1 items]",
            hash: "abc123",
            traceId: "trace-1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "miso-ramen" };

    const result = await runAiRefresh({
      kind: "recipe",
      metaRef,
      payload: { name: "Miso Ramen", recipeIngredient: ["miso paste"] },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
      force: true,
    });

    expect(result.autoLinked).toBe(0);
  });
});

// ── Ingredient kind ───────────────────────────────────────────────────────────

describe("runAiRefresh ingredient: auto-apply pairings", () => {
  test("auto-applies high-confidence pairings and records aiEvent", async () => {
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
            hash: "def456",
            traceId: "trace-2",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = makeEnv();
    await store.put("ingredients", "en/cumin", { name: "Cumin" });

    const metaRef = { collection: "ingredients" as const, locale: "en", slug: "cardamom" };

    const result = await runAiRefresh({
      kind: "ingredient",
      metaRef,
      payload: { name: "Cardamom" },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
    });

    expect(result.autoLinked).toBe(1);
    const pairing = await store.get("pairings", "cardamom--cumin");
    expect(pairing).not.toBeNull();

    const meta = await sidecar.read(metaRef);
    const aiEvents = (meta!.data as Record<string, unknown>)["aiEvents"] as Array<unknown>;
    expect(aiEvents?.some((e: unknown) => (e as { type: string }).type === "auto-applied")).toBe(
      true,
    );
  });

  test("low-confidence pairings are not auto-applied", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "pairings",
          {
            kind: "single" as const,
            value: [{ slug: "cumin", description: "Weak pair", confidence: "low" as const }],
            confidence: "low" as const,
            summary: "pairings: [1 items]",
            hash: "def456",
            traceId: "trace-2",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = makeEnv();
    await store.put("ingredients", "en/cumin", { name: "Cumin" });

    const metaRef = { collection: "ingredients" as const, locale: "en", slug: "cardamom" };

    const result = await runAiRefresh({
      kind: "ingredient",
      metaRef,
      payload: { name: "Cardamom" },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
    });

    expect(result.autoLinked).toBe(0);
    const pairing = await store.get("pairings", "cardamom--cumin");
    expect(pairing).toBeNull();
  });

  test("language mismatch: languageMismatch flag set when detected language differs from locale", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map(),
      autoApplied: new Map([
        [
          "language",
          { value: "de", hash: "h1", summary: "language: de", confidence: "high" as const },
        ],
      ]),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "ingredients" as const, locale: "en", slug: "kardamom" };

    const result = await runAiRefresh({
      kind: "ingredient",
      metaRef,
      payload: { name: "Kardamom" },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
      existingMeta: {},
    });

    const suggestions = result.aiSuggestions as { languageMismatch: boolean };
    expect(suggestions.languageMismatch).toBe(true);
  });
});

// ── Pairing kind ─────────────────────────────────────────────────────────────

describe("runAiRefresh pairing", () => {
  test("returns aiSuggestions keyed by locale without auto-applying anything", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "description",
          {
            kind: "single" as const,
            value: "Earthy and aromatic",
            confidence: "medium" as const,
            summary: "description: Earthy and aromatic",
            hash: "ghi789",
            traceId: "trace-3",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "pairings" as const, slug: "cardamom--cumin" };

    const result = await runAiRefresh({
      kind: "pairing",
      metaRef,
      payload: {
        descriptions: { en: "Nice pair" },
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

    expect(result.autoLinked).toBe(0);
    expect(result.skipped).toBe(false);
    const suggestions = result.aiSuggestions as Record<string, unknown>;
    expect(suggestions["en"]).toBeDefined();
    expect((suggestions["en"] as { improvements: unknown[] }).improvements.length).toBeGreaterThan(
      0,
    );
  });

  test("returns empty improvements when runRefine returns no description suggestion", async () => {
    const refine = await import("@pixelmord/content-ai-refine");
    vi.mocked(refine.runRefine).mockResolvedValueOnce({
      suggestions: new Map(),
      autoApplied: new Map(),
      traces: new Map(),
    });

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "pairings" as const, slug: "cardamom--cumin" };

    // Pre-seed a rejected event.
    await eventLog.append(
      { kind: metaRef.collection, id: metaRef.slug },
      {
        type: "rejected",
        field: "description",
        suggestion: { hash: "abc123", summary: "Bad suggestion" },
        model: "gpt-4o",
      },
    );

    const result = await runAiRefresh({
      kind: "pairing",
      metaRef,
      payload: { descriptions: { en: "Nice pair" } },
      missingFields: [],
      locale: "en",
      store,
      sidecar,
      eventLog,
      config: CONFIG,
    });

    const suggestions = result.aiSuggestions as Record<string, unknown>;
    expect((suggestions["en"] as { improvements: unknown[] }).improvements).toHaveLength(0);
  });
});

// ── Proposer progress events ──────────────────────────────────────────────────

describe("runAiRefresh recipe: proposer progress events", () => {
  test("emits proposer:start and proposer:done events to pubsub when origin is set", async () => {
    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "ramen" };
    const runId = "progress-test-run";

    const events: PubSubEvent[] = [];
    const unsub = subscribe(runId, (e) => events.push(e));

    await withOrigin(
      {
        surface: "admin",
        action: "aiRefreshSuggestions",
        triggeredBy: "editor",
        userInitiated: true,
        runId,
      },
      () =>
        runAiRefresh({
          kind: "recipe",
          metaRef,
          payload: { name: "Ramen", recipeIngredient: ["noodles"] },
          missingFields: ["description"],
          locale: "en",
          store,
          sidecar,
          eventLog,
          config: CONFIG,
          existingMeta: {},
          force: true,
        }),
    );

    unsub();

    const startEvents = events.filter((e) => e["type"] === "proposer:start");
    const doneEvents = events.filter((e) => e["type"] === "proposer:done");

    expect(startEvents.length).toBeGreaterThan(0);
    expect(doneEvents.length).toBeGreaterThan(0);
    // Every started proposer has a matching done event
    const startedNames = new Set(startEvents.map((e) => e["name"]));
    const doneNames = new Set(doneEvents.map((e) => e["name"]));
    for (const name of startedNames) {
      expect(doneNames.has(name)).toBe(true);
    }
  });

  test("does not throw if no pubsub subscriber is present", async () => {
    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "recipes" as const, locale: "en", slug: "ramen-no-sub" };

    await expect(
      withOrigin(
        {
          surface: "admin",
          action: "aiRefreshSuggestions",
          triggeredBy: "editor",
          userInitiated: true,
          runId: "no-subscriber-run",
        },
        () =>
          runAiRefresh({
            kind: "recipe",
            metaRef,
            payload: { name: "Ramen" },
            missingFields: [],
            locale: "en",
            store,
            sidecar,
            eventLog,
            config: CONFIG,
            existingMeta: {},
            force: true,
          }),
      ),
    ).resolves.toBeDefined();
  });
});

// ── Fingerprint stability invariants ─────────────────────────────────────────

describe("runAiRefresh: fingerprint stability", () => {
  test("same inputs produce the same fingerprint", () => {
    const inputs = {
      recipe: { name: "Miso Ramen" },
      missingFields: ["description"],
      locale: "en",
      model: "gpt-4o",
      rejectedHashes: [],
    };
    expect(hashContent(inputs)).toBe(hashContent(inputs));
  });

  test("different recipe produces a different fingerprint", () => {
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
});
