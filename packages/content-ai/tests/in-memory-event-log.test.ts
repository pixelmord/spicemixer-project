import { describe, expect, test } from "vite-plus/test";
import { createAiEventLog, SidecarEventLog } from "../src/event-log.ts";
import type { AiEventSidecar, MetaRef, AiEventLog } from "../src/event-log.ts";
import type { AiEvent } from "../src/schemas/ai-events.ts";
import { InMemoryAiEventLog } from "../src/testing/in-memory-event-log.ts";

// ── shared helpers ─────────────────────────────────────────────────────────────

const REF: MetaRef = { collection: "ingredients", locale: "en", slug: "cardamom" };
const REF2: MetaRef = { collection: "recipes", locale: "en", slug: "soup" };

function makeEvent(type: AiEvent["type"], field: string, hash: string): AiEvent {
  return {
    type,
    field,
    suggestion: { hash, summary: `${field} ${hash}` },
    at: "2026-01-01T00:00:00.000Z",
    model: "test-model",
  };
}

function makeSidecar(
  initial: Record<string, unknown> = {},
): AiEventSidecar & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>(Object.entries(initial));

  function key(ref: MetaRef) {
    return `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
  }

  return {
    store,
    async read(ref) {
      const data = store.get(key(ref));
      return data !== undefined ? { data } : null;
    },
    async write(ref, data) {
      store.set(key(ref), data);
    },
  };
}

// ── parity test factory ───────────────────────────────────────────────────────

type LogFactory = {
  makeLog: () => AiEventLog;
  seed: (ref: MetaRef, events: AiEvent[]) => Promise<void>;
};

function makeSidecarFactory(): LogFactory {
  const sidecar = makeSidecar();
  const log = createAiEventLog(sidecar);
  return {
    makeLog: () => log,
    seed: async (ref, events) => {
      const key = `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
      sidecar.store.set(key, { aiEvents: events });
    },
  };
}

function makeInMemoryFactory(): LogFactory {
  const log = new InMemoryAiEventLog();
  return {
    makeLog: () => log,
    seed: async (ref, events) => {
      for (const event of events) {
        await log.seed(ref, event);
      }
    },
  };
}

const PARITY_CASES: Array<[string, () => LogFactory]> = [
  ["SidecarEventLog", makeSidecarFactory],
  ["InMemoryAiEventLog", makeInMemoryFactory],
];

// ── parity suite ──────────────────────────────────────────────────────────────

for (const [name, makeFactory] of PARITY_CASES) {
  describe(`${name} — parity: read`, () => {
    test("returns [] when entity has no events", async () => {
      const { makeLog } = makeFactory();
      expect(await makeLog().read(REF)).toEqual([]);
    });

    test("returns stored events after seeding", async () => {
      const { makeLog, seed } = makeFactory();
      const log = makeLog();
      const event = makeEvent("accepted", "name", "abc");
      await seed(REF, [event]);
      expect(await log.read(REF)).toEqual([event]);
    });
  });

  describe(`${name} — parity: append`, () => {
    test("append then read returns the event", async () => {
      const { makeLog } = makeFactory();
      const log = makeLog();
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

    test("stamps an ISO timestamp automatically", async () => {
      const { makeLog } = makeFactory();
      const log = makeLog();
      await log.append(REF, {
        type: "accepted",
        field: "name",
        suggestion: { hash: "abc", summary: "x" },
        model: "m",
      });
      const events = await log.read(REF);
      expect(events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("multiple appends accumulate events", async () => {
      const { makeLog } = makeFactory();
      const log = makeLog();
      await log.append(REF, {
        type: "accepted",
        field: "name",
        suggestion: { hash: "h1", summary: "first" },
        model: "m",
      });
      await log.append(REF, {
        type: "auto-applied",
        field: "pairings",
        suggestion: { hash: "h2", summary: "second" },
        model: "m",
      });
      expect(await log.read(REF)).toHaveLength(2);
    });

    test("events for different refs are independent", async () => {
      const { makeLog } = makeFactory();
      const log = makeLog();
      await log.append(REF, {
        type: "accepted",
        field: "name",
        suggestion: { hash: "h1", summary: "x" },
        model: "m",
      });
      await log.append(REF2, {
        type: "accepted",
        field: "name",
        suggestion: { hash: "h2", summary: "y" },
        model: "m",
      });
      expect(await log.read(REF)).toHaveLength(1);
      expect(await log.read(REF2)).toHaveLength(1);
    });
  });

  describe(`${name} — parity: shouldSkip (suppression)`, () => {
    test("returns false when no rejected events", async () => {
      const { makeLog, seed } = makeFactory();
      const log = makeLog();
      await seed(REF, [makeEvent("accepted", "name", "abc")]);
      expect(await log.shouldSkip(REF, { fieldPath: "name", hash: "abc" })).toBe(false);
    });

    test("returns true when a rejected event matches (fieldPath, hash)", async () => {
      const { makeLog, seed } = makeFactory();
      const log = makeLog();
      await seed(REF, [makeEvent("rejected", "summary", "xyz")]);
      expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "xyz" })).toBe(true);
    });

    test("returns false when field matches but hash differs", async () => {
      const { makeLog, seed } = makeFactory();
      const log = makeLog();
      await seed(REF, [makeEvent("rejected", "summary", "xyz")]);
      expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "aaa" })).toBe(false);
    });

    test("returns false when hash matches but fieldPath differs", async () => {
      const { makeLog, seed } = makeFactory();
      const log = makeLog();
      await seed(REF, [makeEvent("rejected", "name", "xyz")]);
      expect(await log.shouldSkip(REF, { fieldPath: "summary", hash: "xyz" })).toBe(false);
    });

    test("suppression filter drops fingerprint-matched inputs after reject append", async () => {
      const { makeLog } = makeFactory();
      const log = makeLog();
      await log.append(REF, {
        type: "rejected",
        field: "pairings",
        suggestion: { hash: "abc123", summary: "bad pairing" },
        model: "m",
      });
      expect(await log.shouldSkip(REF, { fieldPath: "pairings", hash: "abc123" })).toBe(true);
    });
  });

  describe(`${name} — parity: buildRejectedContext`, () => {
    test("returns empty array when no rejected events", async () => {
      const { makeLog } = makeFactory();
      const result = await makeLog().buildRejectedContext(REF);
      expect(result).toEqual([]);
    });

    test("returns structured items for rejected events", async () => {
      const { makeLog, seed } = makeFactory();
      const log = makeLog();
      await seed(REF, [makeEvent("rejected", "description", "h1")]);
      const result = await log.buildRejectedContext(REF);
      expect(result).toHaveLength(1);
      expect(result[0].fieldPath).toBe("description");
      expect(result[0].summary).toMatch("description h1");
      expect(result[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("excludes non-rejected events", async () => {
      const { makeLog, seed } = makeFactory();
      const log = makeLog();
      await seed(REF, [
        makeEvent("accepted", "name", "h1"),
        makeEvent("rejected", "tags", "h2"),
        makeEvent("auto-applied", "pairings", "h3"),
      ]);
      const result = await log.buildRejectedContext(REF);
      expect(result).toHaveLength(1);
      expect(result[0].fieldPath).toBe("tags");
    });
  });

  describe(`${name} — parity: per-entity locking`, () => {
    test("concurrent appends for the same ref serialise — all events persisted", async () => {
      const { makeLog } = makeFactory();
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

      expect(await log.read(REF)).toHaveLength(5);
    });

    test("concurrent appends for different refs do not block each other", async () => {
      const { makeLog } = makeFactory();
      const log = makeLog();

      await Promise.all([
        log.append(REF, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h1", summary: "x" },
          model: "m",
        }),
        log.append(REF2, {
          type: "accepted",
          field: "name",
          suggestion: { hash: "h2", summary: "y" },
          model: "m",
        }),
      ]);

      expect(await log.read(REF)).toHaveLength(1);
      expect(await log.read(REF2)).toHaveLength(1);
    });
  });
}

// ── InMemoryAiEventLog-specific tests ─────────────────────────────────────────

describe("InMemoryAiEventLog — type check", () => {
  test("implements AiEventLog interface", () => {
    const log: AiEventLog = new InMemoryAiEventLog();
    expect(log).toBeInstanceOf(InMemoryAiEventLog);
  });
});

describe("InMemoryAiEventLog — seed helper", () => {
  test("seed pre-populates events without stamping a new timestamp", async () => {
    const log = new InMemoryAiEventLog();
    const event = makeEvent("rejected", "name", "seeded-hash");
    await log.seed(REF, event);
    const events = await log.read(REF);
    expect(events).toHaveLength(1);
    expect(events[0].at).toBe(event.at);
  });

  test("seed does not apply pruning — raw events are stored as-is", async () => {
    const log = new InMemoryAiEventLog();
    const events = Array.from({ length: 3 }, (_, i) => makeEvent("accepted", "name", `h${i}`));
    for (const e of events) {
      await log.seed(REF, e);
    }
    expect(await log.read(REF)).toHaveLength(3);
  });
});

describe("InMemoryAiEventLog — clear helper", () => {
  test("clear removes all events for a ref", async () => {
    const log = new InMemoryAiEventLog();
    await log.append(REF, {
      type: "accepted",
      field: "name",
      suggestion: { hash: "h1", summary: "x" },
      model: "m",
    });
    log.clear(REF);
    expect(await log.read(REF)).toEqual([]);
  });

  test("clear leaves other refs untouched", async () => {
    const log = new InMemoryAiEventLog();
    await log.append(REF, {
      type: "accepted",
      field: "name",
      suggestion: { hash: "h1", summary: "x" },
      model: "m",
    });
    await log.append(REF2, {
      type: "accepted",
      field: "name",
      suggestion: { hash: "h2", summary: "y" },
      model: "m",
    });
    log.clear(REF);
    expect(await log.read(REF)).toEqual([]);
    expect(await log.read(REF2)).toHaveLength(1);
  });
});

// ── SidecarEventLog: implements AiEventLog ───────────────────────────────────

describe("SidecarEventLog satisfies AiEventLog interface", () => {
  test("createAiEventLog returns a SidecarEventLog that satisfies AiEventLog", () => {
    const log: AiEventLog = createAiEventLog(makeSidecar());
    expect(log).toBeInstanceOf(SidecarEventLog);
  });
});
