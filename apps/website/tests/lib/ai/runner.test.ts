import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { InMemoryStore } from "../../../src/lib/stores/in-memory.ts";
import { createMetaSidecar } from "../../../src/lib/meta-sidecar.ts";
import { runAiRefresh } from "../../../src/lib/ai/runner.ts";
import type { AiConfig, PubSubEvent } from "content-ai";
import { createAiEventLog, hashContent, runWithOrigin, subscribe } from "content-ai";

// Stub content-ai proposers to avoid network calls; keep real event/hash utilities.
vi.mock("content-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("content-ai")>();
  return {
    ...actual,
    proposeRecipeImprovements: vi.fn().mockResolvedValue({ fields: [] }),
    proposeTags: vi.fn().mockResolvedValue({ tags: [] }),
    proposeIngredientLinks: vi.fn().mockResolvedValue([]),
    proposeRelations: vi.fn().mockResolvedValue([]),
    detectLanguage: vi.fn().mockResolvedValue(null),
    proposeIngredientImprovements: vi.fn().mockResolvedValue({ fields: [] }),
    proposeIngredientPairings: vi.fn().mockResolvedValue([]),
    proposePairingImprovements: vi.fn().mockResolvedValue({ fields: [] }),
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

  test("cache hit: returns cached suggestion without re-running proposers", async () => {
    const contentAi = await import("content-ai");
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

    vi.mocked(contentAi.proposeTags).mockClear();

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
    expect(vi.mocked(contentAi.proposeTags)).not.toHaveBeenCalled();
  });

  test("force=true bypasses cache and re-runs proposers", async () => {
    const contentAi = await import("content-ai");
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

    vi.mocked(contentAi.proposeTags).mockClear();

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
    expect(vi.mocked(contentAi.proposeTags)).toHaveBeenCalled();
  });

  test("cache is invalidated when payload changes", async () => {
    const contentAi = await import("content-ai");
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

    vi.mocked(contentAi.proposeTags).mockClear();

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
    expect(vi.mocked(contentAi.proposeTags)).toHaveBeenCalled();
  });

  test("language-mismatch: detectedLanguage returned when content language differs from locale", async () => {
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.detectLanguage).mockResolvedValue({ language: "de" } as never);

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposeIngredientLinks).mockResolvedValue([
      { pattern: "miso", slug: "miso", confidence: "high" } as never,
    ]);
    vi.mocked(contentAi.detectLanguage).mockResolvedValue({ language: "en" } as never);

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposeIngredientLinks).mockResolvedValue([
      { pattern: "miso", slug: "miso", confidence: "low" } as never,
    ]);

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposeIngredientPairings).mockResolvedValue([
      { slug: "cumin", description: "Fragrant pair", confidence: "high" } as never,
    ]);

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposeIngredientPairings).mockResolvedValue([
      { slug: "cumin", description: "Weak pair", confidence: "low" } as never,
    ]);

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.detectLanguage).mockResolvedValue({ language: "de" } as never);

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
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposePairingImprovements).mockResolvedValue({
      fields: [{ field: "description", suggestion: "Earthy and aromatic" }],
    } as never);

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

  test("passes rejected context from eventLog to proposePairingImprovements", async () => {
    const contentAi = await import("content-ai");
    vi.mocked(contentAi.proposePairingImprovements).mockResolvedValue({ fields: [] } as never);

    const { store, sidecar, eventLog } = makeEnv();
    const metaRef = { collection: "pairings" as const, slug: "cardamom--cumin" };

    // Pre-seed a rejected event.
    await eventLog.append(metaRef, {
      type: "rejected",
      field: "description",
      suggestion: { hash: "abc123", summary: "Bad suggestion" },
      model: "gpt-4o",
    });

    await runAiRefresh({
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

    const callArgs = vi.mocked(contentAi.proposePairingImprovements).mock.calls.at(-1)!;
    const rejectedContext = callArgs[3];
    expect(typeof rejectedContext).toBe("string");
    expect((rejectedContext as string).length).toBeGreaterThan(0);
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

    await runWithOrigin(
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
      runWithOrigin(
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
