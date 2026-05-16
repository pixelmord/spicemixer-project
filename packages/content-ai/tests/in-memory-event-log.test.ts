import { describe, expect, test } from "vite-plus/test";
import { InMemoryAiEventLog } from "../src/testing/index.ts";
import { createAiEventLog } from "../src/event-log.ts";
import type { AiEventLog, AiEventSidecar, MetaRef } from "../src/event-log.ts";
import type { AiEvent } from "../src/schemas/ai-events.ts";

// ── shared fixtures ───────────────────────────────────────────────────────────

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

// ── parity suite: runs against both implementations ───────────────────────────

function parityTests(label: string, makeLog: () => AiEventLog) {
  describe(`${label} — parity`, () => {
    // read
    describe("read", () => {
      test("returns [] when entity has no events", async () => {
        const log = makeLog();
        expect(await log.read(REF)).toEqual([]);
      });

      test("returns events after append", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h1", summary: "name h1" },
          model: "m",
        });
        const events = await log.read(REF);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("accepted");
        expect(events[0].field).toBe("name");
      });

      test("isolates different refs", async () => {
        const log = makeLog();
        const ref2: MetaRef = { collection: "recipes", locale: "en", slug: "soup" };
        await log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h1", summary: "x" },
          model: "m",
        });
        expect(await log.read(ref2)).toEqual([]);
      });
    });

    // append
    describe("append", () => {
      test("stamps an ISO timestamp automatically", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h1", summary: "x" },
          model: "m",
        });
        const events = await log.read(REF);
        expect(events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      test("accumulates multiple appends in order", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h1", summary: "first" },
          model: "m",
        });
        await log.append(REF, {
          type: "rejected",
          field: "tags",
          suggestion: { hash: "h2", summary: "second" },
          model: "m",
        });
        const events = await log.read(REF);
        expect(events).toHaveLength(2);
        expect(events[0].field).toBe("name");
        expect(events[1].field).toBe("tags");
      });
    });

    // shouldSkip
    describe("shouldSkip", () => {
      test("returns false when no rejected events", async () => {
        const log = makeLog();
        expect(await log.shouldSkip(REF, { fieldPath: "name", hash: "abc" })).toBe(false);
      });

      test("returns true when a rejected event matches (fieldPath, hash)", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "rejected",
          field: "summary",
          suggestion: { hash: "xyz", summary: "summary xyz" },
          model: "m",
        });
        expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "xyz" })).toBe(true);
      });

      test("returns false when field matches but hash differs", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "rejected",
          field: "summary",
          suggestion: { hash: "xyz", summary: "summary xyz" },
          model: "m",
        });
        expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "aaa" })).toBe(false);
      });

      test("returns false when hash matches but fieldPath differs", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "rejected",
          field: "name",
          suggestion: { hash: "xyz", summary: "name xyz" },
          model: "m",
        });
        expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "xyz" })).toBe(false);
      });

      test("accepted events do not trigger suppression", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "abc", summary: "name abc" },
          model: "m",
        });
        expect(await log.shouldSkip(REF, { fieldPath: "name", hash: "abc" })).toBe(false);
      });
    });

    // buildRejectedContext
    describe("buildRejectedContext", () => {
      test("returns empty array when no events", async () => {
        const log = makeLog();
        expect(await log.buildRejectedContext(REF)).toEqual([]);
      });

      test("returns empty array when no rejected events", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h1", summary: "x" },
          model: "m",
        });
        expect(await log.buildRejectedContext(REF)).toEqual([]);
      });

      test("returns structured items for rejected events", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "rejected",
          field: "description",
          suggestion: { hash: "h1", summary: "description h1" },
          model: "m",
        });
        const result = await log.buildRejectedContext(REF);
        expect(result).toHaveLength(1);
        expect(result[0].fieldPath).toBe("description");
        expect(result[0].summary).toBe("description h1");
        expect(result[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      test("excludes non-rejected events", async () => {
        const log = makeLog();
        await log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h1", summary: "x" },
          model: "m",
        });
        await log.append(REF, {
          type: "rejected",
          field: "tags",
          suggestion: { hash: "h2", summary: "tags h2" },
          model: "m",
        });
        await log.append(REF, {
          type: "auto-applied",
          field: "pairings",
          suggestion: { hash: "h3", summary: "y" },
          model: "m",
        });
        const result = await log.buildRejectedContext(REF);
        expect(result).toHaveLength(1);
        expect(result[0].fieldPath).toBe("tags");
      });
    });

    // per-entity locking
    describe("per-entity locking", () => {
      test("concurrent appends for the same ref serialise — all events persisted", async () => {
        const log = makeLog();
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
        const log = makeLog();
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
  });
}

// ── sidecar-backed log (fake sidecar) ─────────────────────────────────────────

function makeSidecar(): AiEventSidecar {
  const store = new Map<string, unknown>();
  function key(ref: MetaRef) {
    return `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
  }
  return {
    async read(ref) {
      const data = store.get(key(ref));
      return data !== undefined ? { data } : null;
    },
    async write(ref, data) {
      store.set(key(ref), data);
    },
  };
}

parityTests("SidecarEventLog", () => createAiEventLog(makeSidecar()));
parityTests("InMemoryAiEventLog", () => new InMemoryAiEventLog());

// ── InMemoryAiEventLog-specific tests ────────────────────────────────────────

describe("InMemoryAiEventLog", () => {
  test("implements AiEventLog interface", () => {
    const log: AiEventLog = new InMemoryAiEventLog();
    expect(typeof log.read).toBe("function");
    expect(typeof log.append).toBe("function");
    expect(typeof log.shouldSkip).toBe("function");
    expect(typeof log.buildRejectedContext).toBe("function");
  });

  test("each instance has independent storage", async () => {
    const log1 = new InMemoryAiEventLog();
    const log2 = new InMemoryAiEventLog();
    await log1.append(REF, {
      type: "accepted",
      field: "name",
      suggestion: { hash: "h1", summary: "x" },
      model: "m",
    });
    expect(await log1.read(REF)).toHaveLength(1);
    expect(await log2.read(REF)).toHaveLength(0);
  });

  test("pre-seeded events visible on read", async () => {
    const log = new InMemoryAiEventLog();
    const event = makeEvent("rejected", "name", "abc");
    // Seed via append
    await log.append(REF, {
      type: "rejected",
      field: "name",
      suggestion: event.suggestion,
      model: event.model,
    });
    const events = await log.read(REF);
    expect(events).toHaveLength(1);
    expect(events[0].suggestion.hash).toBe("abc");
  });

  test("suppression persists across calls within one instance", async () => {
    const log = new InMemoryAiEventLog();
    await log.append(REF, {
      type: "rejected",
      field: "pairings",
      suggestion: { hash: "zzz", summary: "pairing" },
      model: "m",
    });
    expect(await log.shouldSkip(REF, { fieldPath: "pairings", hash: "zzz" })).toBe(true);
    expect(await log.shouldSkip(REF, { fieldPath: "pairings", hash: "zzz" })).toBe(true);
  });
});
