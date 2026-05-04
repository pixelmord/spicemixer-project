import { describe, expect, test } from "vite-plus/test";
import { createAiEventLog } from "../src/event-log.ts";
import type { AiEventSidecar, MetaRef } from "../src/event-log.ts";
import type { AiEvent } from "../src/schemas/ai-events.ts";
import { hashContent, hashSuggestion } from "../src/hash.ts";

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
});

// ── isSuppressed ──────────────────────────────────────────────────────────────

describe("AiEventLog.isSuppressed", () => {
  test("returns false when no rejected events", () => {
    const log = createAiEventLog(makeSidecar());
    const events = [makeEvent("accepted", "name", "abc")];
    expect(log.isSuppressed(events, "name", "abc")).toBe(false);
  });

  test("returns true when a rejected event matches (field, hash)", () => {
    const log = createAiEventLog(makeSidecar());
    const events = [makeEvent("rejected", "summary", "xyz")];
    expect(log.isSuppressed(events, "summary", "xyz")).toBe(true);
  });

  test("returns false when field matches but hash differs", () => {
    const log = createAiEventLog(makeSidecar());
    const events = [makeEvent("rejected", "summary", "xyz")];
    expect(log.isSuppressed(events, "summary", "aaa")).toBe(false);
  });

  test("returns false when hash matches but field differs", () => {
    const log = createAiEventLog(makeSidecar());
    const events = [makeEvent("rejected", "name", "xyz")];
    expect(log.isSuppressed(events, "summary", "xyz")).toBe(false);
  });

  test("suppression blocks re-suggestion of same hash on same field", () => {
    const log = createAiEventLog(makeSidecar());
    const hash = hashSuggestion({ slug: "cumin", pairingSlug: "caraway" });
    const events = [makeEvent("rejected", "pairings", hash)];
    expect(log.isSuppressed(events, "pairings", hash)).toBe(true);
  });
});

// ── buildRejectedContext ──────────────────────────────────────────────────────

describe("AiEventLog.buildRejectedContext", () => {
  test("returns empty string when no rejected events", () => {
    const log = createAiEventLog(makeSidecar());
    expect(log.buildRejectedContext([])).toBe("");
  });

  test("formats rejected events into a context string", () => {
    const log = createAiEventLog(makeSidecar());
    const events = [makeEvent("rejected", "name", "abc")];
    const ctx = log.buildRejectedContext(events);
    expect(ctx).toContain("Previously rejected");
    expect(ctx).toContain("name");
  });
});

// ── shouldSkip ────────────────────────────────────────────────────────────────

describe("AiEventLog.shouldSkip", () => {
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
    const result = await log.shouldSkip(REF, INPUTS);
    expect(result.skip).toBe(false);
  });

  test("returns the computed fingerprint when skip:false", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const result = await log.shouldSkip(REF, INPUTS);
    if (result.skip) throw new Error("unexpected skip");
    expect(result.fingerprint).toBe(expectedFingerprint());
  });

  test("returns existingEvents when skip:false", async () => {
    const event = makeEvent("accepted", "name", "abc");
    const sidecar = makeSidecar();
    await sidecar.write(REF, { aiEvents: [event] });
    const log = createAiEventLog(sidecar);
    const result = await log.shouldSkip(REF, INPUTS);
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
    const result = await log.shouldSkip(REF, INPUTS);
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
    const result = await log.shouldSkip(REF, INPUTS, true);
    expect(result.skip).toBe(false);
  });

  test("rejected-event hashes feed the next fingerprint (new rejection busts cache)", async () => {
    const sidecar = makeSidecar();
    const fingerprintBefore = expectedFingerprint();

    // Cached with the old fingerprint (no rejected events)
    await sidecar.write(REF, {
      aiSuggestions: { fingerprint: fingerprintBefore, data: { improvements: [] } },
    });

    const log = createAiEventLog(sidecar);
    const resultBefore = await log.shouldSkip(REF, INPUTS);
    expect(resultBefore.skip).toBe(true);

    // Now add a rejected event — fingerprint must change
    const rejectedEvent = makeEvent("rejected", "summary", "def789");
    await sidecar.write(REF, {
      aiEvents: [rejectedEvent],
      aiSuggestions: { fingerprint: fingerprintBefore, data: { improvements: [] } },
    });

    const resultAfter = await log.shouldSkip(REF, INPUTS);
    expect(resultAfter.skip).toBe(false);
    if (resultAfter.skip) throw new Error("expected no skip");
    expect(resultAfter.fingerprint).not.toBe(fingerprintBefore);
    expect(resultAfter.fingerprint).toBe(expectedFingerprint([rejectedEvent]));
  });

  test("missingFields order does not affect fingerprint", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const r1 = await log.shouldSkip(REF, { ...INPUTS, missingFields: ["a", "b"] });
    const r2 = await log.shouldSkip(REF, { ...INPUTS, missingFields: ["b", "a"] });
    if (r1.skip || r2.skip) throw new Error("unexpected skip");
    expect(r1.fingerprint).toBe(r2.fingerprint);
  });
});

// ── integration: append + shouldSkip ─────────────────────────────────────────

describe("AiEventLog integration: append then shouldSkip", () => {
  test("append preserves aiSuggestions cache so shouldSkip can still find it", async () => {
    const sidecar = makeSidecar();
    const log = createAiEventLog(sidecar);
    const INPUTS = {
      recipe: { name: "Test" },
      missingFields: [],
      locale: "en",
      model: "m",
    };

    // Seed a valid cache
    const rejectedHashes: string[] = [];
    const fingerprint = hashContent({
      recipe: INPUTS.recipe,
      missingFields: [],
      locale: "en",
      model: "m",
      rejectedHashes,
    });
    await sidecar.write(REF, { aiSuggestions: { fingerprint, data: { tags: [] } } });

    // append an auto-applied event (should preserve aiSuggestions)
    await log.append(REF, {
      type: "auto-applied",
      field: "pairings",
      suggestion: { hash: "aaa", summary: "test" },
      model: "m",
    });

    // shouldSkip should still find the cached fingerprint
    const result = await log.shouldSkip(REF, INPUTS);
    expect(result.skip).toBe(true);
  });
});
