import { describe, expect, test } from "vite-plus/test";
import { createAiEventLog, SidecarEventLog } from "../src/event-log.ts";
import type { AiEventSidecar, MetaRef } from "../src/event-log.ts";
import type { AiEvent } from "../src/schemas/ai-events.ts";
import { hashContent, hashSuggestion } from "../src/hash.ts";
import { isPrunable, planPrune } from "../src/events.ts";

// ── fake sidecar ──────────────────────────────────────────────────────────────

function makeSidecar(
  initial: Record<string, unknown> = {},
): AiEventSidecar & { store: Map<string, unknown>; writes: number } {
  const store = new Map<string, unknown>(Object.entries(initial));
  let writes = 0;

  function key(ref: MetaRef) {
    return `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
  }

  return {
    store,
    get writes() {
      return writes;
    },
    async read(ref) {
      const data = store.get(key(ref));
      return data !== undefined ? { data } : null;
    },
    async write(ref, data) {
      writes++;
      store.set(key(ref), data);
    },
  };
}

const REF: MetaRef = { collection: "ingredients", locale: "en", slug: "cardamom" };

function makeEvent(type: AiEvent["type"], field: string, hash: string): AiEvent {
  return {
    type,
    field,
    suggestion: { hash, summary: `${field} ${hash}` },
    at: "2026-01-01T00:00:00.000Z",
    model: "test-model",
  };
}

// ── isPrunable ────────────────────────────────────────────────────────────────

describe("isPrunable", () => {
  test("returns true for auto-applied events", () => {
    expect(isPrunable(makeEvent("auto-applied", "pairings", "abc"))).toBe(true);
  });

  test("returns true for accepted events", () => {
    expect(isPrunable(makeEvent("accepted", "name", "abc"))).toBe(true);
  });

  test("returns false for rejected events", () => {
    expect(isPrunable(makeEvent("rejected", "name", "abc"))).toBe(false);
  });

  test("returns false for ingested events", () => {
    const ev: AiEvent = {
      type: "ingested",
      source: "https://example.com",
      suggestion: { hash: "abc", summary: "imported" },
      model: "recipe-ingestion",
      at: "2026-01-01T00:00:00.000Z",
    };
    expect(isPrunable(ev)).toBe(false);
  });
});

// ── planPrune ─────────────────────────────────────────────────────────────────

describe("planPrune", () => {
  test("returns events unchanged when at or below cap", () => {
    const events = [makeEvent("accepted", "name", "abc"), makeEvent("rejected", "tags", "xyz")];
    expect(planPrune(events, 10)).toHaveLength(2);
  });

  test("prunes oldest auto-applied first", () => {
    const old = { ...makeEvent("auto-applied", "pairings", "old"), at: "2020-01-01T00:00:00.000Z" };
    const recent = {
      ...makeEvent("auto-applied", "pairings", "new"),
      at: "2024-01-01T00:00:00.000Z",
    };
    const result = planPrune([old, recent], 1);
    expect(result).toHaveLength(1);
    expect(result[0].suggestion.hash).toBe("new");
  });

  test("rejected events survive planPrune regardless of cap", () => {
    const rejected = Array.from({ length: 5 }, (_, i) => makeEvent("rejected", "name", `hash${i}`));
    const autoApplied = Array.from({ length: 5 }, (_, i) =>
      makeEvent("auto-applied", "pairings", `auto${i}`),
    );
    const result = planPrune([...rejected, ...autoApplied], 5);
    // All 5 rejected survive; auto-applied are pruned to reach cap of 5
    expect(result.filter((e) => e.type === "rejected")).toHaveLength(5);
    expect(result).toHaveLength(5);
  });

  test("ingested events survive planPrune", () => {
    const ingested: AiEvent = {
      type: "ingested",
      source: "https://example.com",
      suggestion: { hash: "src", summary: "imported" },
      model: "recipe-ingestion",
      at: "2020-01-01T00:00:00.000Z",
    };
    const autoApplied = Array.from({ length: 5 }, (_, i) =>
      makeEvent("auto-applied", "pairings", `auto${i}`),
    );
    const result = planPrune([ingested, ...autoApplied], 3);
    expect(result.find((e) => e.type === "ingested")).toBeDefined();
  });

  test("uses default cap of 100 when capHint omitted", () => {
    const events = Array.from({ length: 95 }, (_, i) => makeEvent("accepted", "name", `h${i}`));
    expect(planPrune(events)).toHaveLength(95);
  });
});

// ── read ──────────────────────────────────────────────────────────────────────

describe("AiEventLog.read", () => {
  test("returns [] when entity has no meta", async () => {
    const log = createAiEventLog(makeSidecar());
    expect(await log.read(REF)).toEqual([]);
  });

  test("returns [] when meta has no aiEvents field", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { name: "Cardamom" });
    const log = createAiEventLog(sidecar);
    expect(await log.read(REF)).toEqual([]);
  });

  test("returns the stored aiEvents array", async () => {
    const event = makeEvent("accepted", "name", "abc");
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [event] });
    const log = createAiEventLog(sidecar);
    expect(await log.read(REF)).toEqual([event]);
  });
});

// ── append ────────────────────────────────────────────────────────────────────

describe("AiEventLog.append", () => {
  test("writes exactly once to the sidecar", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    await log.append(REF, {
      type: "auto-applied",
      field: "pairings",
      suggestion: { hash: "abc123", summary: "Pairing auto-applied" },
      model: "test-model",
      confidence: "high",
    });
    expect(sidecar.writes).toBe(1);
  });

  test("appends event to existing events without losing other meta fields", async () => {
    const existing = makeEvent("accepted", "name", "abc");
    const sidecar = makeSidecar();
    await sidecar.write(REF, { name: "Cardamom", aiEvents: [existing] });
    const log = createAiEventLog(sidecar);
    await log.append(REF, {
      type: "auto-applied",
      field: "pairings",
      suggestion: { hash: "def456", summary: "Pairing auto-applied" },
      model: "test-model",
    });
    const meta = (await sidecar.read(REF))!.data as Record<string, unknown>;
    expect(meta["name"]).toBe("Cardamom");
    const events = meta["aiEvents"] as AiEvent[];
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(existing);
    expect(events[1]).toMatchObject({ type: "auto-applied", field: "pairings" });
  });

  test("stamps an ISO timestamp automatically", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    await log.append(REF, {
      type: "accepted",
      field: "name",
      suggestion: { hash: "abc", summary: "x" },
      model: "m",
    });
    const meta = (await sidecar.read(REF))!.data as Record<string, unknown>;
    const events = meta["aiEvents"] as AiEvent[];
    expect(events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("creates meta from scratch when entity has no prior meta", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    await log.append(REF, {
      type: "auto-applied",
      field: "pairings",
      suggestion: { hash: "abc", summary: "test" },
      model: "m",
    });
    const meta = (await sidecar.read(REF))!.data as Record<string, unknown>;
    const events = meta["aiEvents"] as AiEvent[];
    expect(events).toHaveLength(1);
  });

  test("read after append returns the appended event", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    await log.append(REF, {
      type: "accepted",
      field: "description",
      suggestion: { hash: "h1", summary: "desc" },
      model: "m",
    });
    const events = await log.read(REF);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("accepted");
  });
});

// ── per-entity lock ───────────────────────────────────────────────────────────

describe("AiEventLog per-entity locking", () => {
  test("concurrent appends for the same ref serialise — all events persisted", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);

    // Fire 5 concurrent appends for the same ref
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: `h${i}`, summary: `event ${i}` },
          model: "m",
        }),
      ),
    );

    const events = await log.read(REF);
    expect(events).toHaveLength(5);
  });

  test("concurrent appends for different refs do not block each other", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const ref2: MetaRef = { collection: "recipes", locale: "en", slug: "soup" };

    await Promise.all([
      log.append(REF, {
        type: "accepted",
        field: "name",
        suggestion: { hash: "h1", summary: "x" },
        model: "m",
      }),
      log.append(ref2, {
        type: "accepted",
        field: "name",
        suggestion: { hash: "h2", summary: "y" },
        model: "m",
      }),
    ]);

    expect(await log.read(REF)).toHaveLength(1);
    expect(await log.read(ref2)).toHaveLength(1);
  });
});

// ── shouldSkip (suppression) ──────────────────────────────────────────────────

describe("AiEventLog.shouldSkip (suppression)", () => {
  test("returns false when no rejected events", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [makeEvent("accepted", "name", "abc")] });
    const log = createAiEventLog(sidecar);
    expect(await log.shouldSkip(REF, { fieldPath: "name", hash: "abc" })).toBe(false);
  });

  test("returns true when a rejected event matches (fieldPath, hash)", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [makeEvent("rejected", "summary", "xyz")] });
    const log = createAiEventLog(sidecar);
    expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "xyz" })).toBe(true);
  });

  test("returns false when field matches but hash differs", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [makeEvent("rejected", "summary", "xyz")] });
    const log = createAiEventLog(sidecar);
    expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "aaa" })).toBe(false);
  });

  test("returns false when hash matches but fieldPath differs", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [makeEvent("rejected", "name", "xyz")] });
    const log = createAiEventLog(sidecar);
    expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "xyz" })).toBe(false);
  });

  test("suppression filter blocks fingerprint-matched inputs", async () => {
    const sidecar = makeSidecar();
    const hash = hashSuggestion({ slug: "cumin", pairingSlug: "caraway" });
    await sidecar.write(REF, { aiEvents: [makeEvent("rejected", "pairings", hash)] });
    const log = createAiEventLog(sidecar);
    expect(await log.shouldSkip(REF, { fieldPath: "pairings", hash })).toBe(true);
  });
});

// ── buildRejectedContext (ref-based) ──────────────────────────────────────────

describe("AiEventLog.buildRejectedContext (ref-based)", () => {
  test("returns empty array when no rejected events", async () => {
    const log = createAiEventLog(makeSidecar());
    const result = await log.buildRejectedContext(REF);
    expect(result).toEqual([]);
  });

  test("returns structured items for rejected events", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [makeEvent("rejected", "description", "h1")] });
    const log = createAiEventLog(sidecar);
    const result = await log.buildRejectedContext(REF);
    expect(result).toHaveLength(1);
    expect(result[0].fieldPath).toBe("description");
    expect(result[0].summary).toMatch("description h1");
    expect(result[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("excludes non-rejected events", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, {
      aiEvents: [
        makeEvent("accepted", "name", "h1"),
        makeEvent("rejected", "tags", "h2"),
        makeEvent("auto-applied", "pairings", "h3"),
      ],
    });
    const log = createAiEventLog(sidecar);
    const result = await log.buildRejectedContext(REF);
    expect(result).toHaveLength(1);
    expect(result[0].fieldPath).toBe("tags");
  });
});

// ── buildRejectedContextString (convenience) ──────────────────────────────────

describe("AiEventLog.buildRejectedContextString (sync convenience)", () => {
  test("returns empty string when no rejected events", () => {
    const log = createAiEventLog(makeSidecar());
    expect(log.buildRejectedContextString([])).toBe("");
  });

  test("formats rejected events into a context string", () => {
    const log = createAiEventLog(makeSidecar());
    const events = [makeEvent("rejected", "name", "abc")];
    const ctx = log.buildRejectedContextString(events);
    expect(ctx).toContain("Previously rejected");
    expect(ctx).toContain("name");
  });
});

// ── checkFingerprint ──────────────────────────────────────────────────────────

describe("SidecarEventLog.checkFingerprint", () => {
  const INPUTS = {
    recipe: { name: "Miso Butter Ramen" },
    missingFields: ["description"],
    locale: "en",
    model: "claude-opus-4-7",
  };

  function expectedFingerprint(events: AiEvent[] = []) {
    const rejectedHashes = events
      .filter((e) => e.type === "rejected")
      .map((e) => `${e.field ?? ""}:${e.suggestion.hash}`)
      .sort();
    return hashContent({
      recipe: INPUTS.recipe,
      missingFields: [...INPUTS.missingFields].sort(),
      locale: INPUTS.locale,
      model: INPUTS.model,
      rejectedHashes,
    });
  }

  test("returns skip:false when no cached suggestions", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const result = await log.checkFingerprint(REF, INPUTS);
    expect(result.skip).toBe(false);
  });

  test("returns the computed fingerprint when skip:false", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const result = await log.checkFingerprint(REF, INPUTS);
    if (result.skip) throw new Error("unexpected skip");
    expect(result.fingerprint).toBe(expectedFingerprint());
  });

  test("returns existingEvents when skip:false", async () => {
    const event = makeEvent("accepted", "name", "abc");
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [event] });
    const log = createAiEventLog(sidecar);
    const result = await log.checkFingerprint(REF, INPUTS);
    if (result.skip) throw new Error("unexpected skip");
    expect(result.existingEvents).toEqual([event]);
  });

  test("fingerprint cache hit short-circuits and returns cached suggestion", async () => {
    const sidecar = makeSidecar();
    const fingerprint = expectedFingerprint();
    const cachedData = { improvements: [], tags: [] };
    await sidecar.write(REF, {
      aiSuggestions: { fingerprint, data: cachedData },
    });
    const log = createAiEventLog(sidecar);
    const result = await log.checkFingerprint(REF, INPUTS);
    expect(result.skip).toBe(true);
    if (!result.skip) throw new Error("expected skip");
    expect(result.cachedSuggestion).toEqual(cachedData);
    expect(result.fingerprint).toBe(fingerprint);
  });

  test("force=true bypasses cache even with matching fingerprint", async () => {
    const sidecar = makeSidecar();
    const fingerprint = expectedFingerprint();
    await sidecar.write(REF, {
      aiSuggestions: { fingerprint, data: { improvements: [] } },
    });
    const log = createAiEventLog(sidecar);
    const result = await log.checkFingerprint(REF, INPUTS, true);
    expect(result.skip).toBe(false);
  });

  test("rejected-event hashes feed the next fingerprint (new rejection busts cache)", async () => {
    const sidecar = makeSidecar();
    const fingerprintBefore = expectedFingerprint();

    await sidecar.write(REF, {
      aiSuggestions: { fingerprint: fingerprintBefore, data: { improvements: [] } },
    });

    const log = createAiEventLog(sidecar);
    const resultBefore = await log.checkFingerprint(REF, INPUTS);
    expect(resultBefore.skip).toBe(true);

    const rejectedEvent = makeEvent("rejected", "summary", "def789");
    await sidecar.write(REF, {
      aiEvents: [rejectedEvent],
      aiSuggestions: { fingerprint: fingerprintBefore, data: { improvements: [] } },
    });

    const resultAfter = await log.checkFingerprint(REF, INPUTS);
    expect(resultAfter.skip).toBe(false);
    if (resultAfter.skip) throw new Error("expected no skip");
    expect(resultAfter.fingerprint).not.toBe(fingerprintBefore);
    expect(resultAfter.fingerprint).toBe(expectedFingerprint([rejectedEvent]));
  });

  test("missingFields order does not affect fingerprint", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const r1 = await log.checkFingerprint(REF, { ...INPUTS, missingFields: ["a", "b"] });
    const r2 = await log.checkFingerprint(REF, { ...INPUTS, missingFields: ["b", "a"] });
    if (r1.skip || r2.skip) throw new Error("unexpected skip");
    expect(r1.fingerprint).toBe(r2.fingerprint);
  });
});

// ── integration: append + checkFingerprint ────────────────────────────────────

describe("SidecarEventLog integration: append then checkFingerprint", () => {
  test("append preserves aiSuggestions cache so checkFingerprint can still find it", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const INPUTS = {
      recipe: { name: "Test" },
      missingFields: [],
      locale: "en",
      model: "m",
    };

    const fingerprint = hashContent({
      recipe: INPUTS.recipe,
      missingFields: [],
      locale: "en",
      model: "m",
      rejectedHashes: [],
    });
    await sidecar.write(REF, { aiSuggestions: { fingerprint, data: { tags: [] } } });

    await log.append(REF, {
      type: "auto-applied",
      field: "pairings",
      suggestion: { hash: "aaa", summary: "test" },
      model: "m",
    });

    const result = await log.checkFingerprint(REF, INPUTS);
    expect(result.skip).toBe(true);
  });
});

// ── type-check: SidecarEventLog implements AiEventLog ────────────────────────

describe("SidecarEventLog satisfies AiEventLog interface", () => {
  test("createAiEventLog returns a SidecarEventLog", () => {
    const log = createAiEventLog(makeSidecar());
    expect(log).toBeInstanceOf(SidecarEventLog);
  });
});
