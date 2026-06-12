import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { z } from "zod";

// Stub the field-level runner; runRefresh is orchestration over it.
vi.mock("../src/run-refine.ts", () => ({
  runRefine: vi.fn().mockResolvedValue({
    suggestions: new Map(),
    autoApplied: new Map(),
    traces: new Map(),
    errors: new Map(),
  }),
}));

const { runRefine } = await import("../src/run-refine.ts");
const { runRefresh } = await import("../src/run-refresh.ts");

const CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "gpt-4o-mini" };
// Bulk target is derived from the contract: fields flagged `bulk: true`.
const contract = {
  schema: z.object({ name: z.string() }),
  presets: [],
  fields: {
    summary: { systemPrompt: () => "s" },
    pairings: { systemPrompt: () => "p", bulk: true },
    language: { systemPrompt: () => "l", bulk: true },
  },
};

function makeStrategy(over: Record<string, unknown> = {}) {
  return {
    contract,
    currentData: { name: "x" },
    assemble: vi.fn().mockResolvedValue("RESULT"),
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(runRefine).mockClear();
  vi.mocked(runRefine).mockResolvedValue({
    suggestions: new Map(),
    autoApplied: new Map(),
    traces: new Map(),
    errors: new Map(),
  });
});

describe("runRefresh: target composition", () => {
  test("full run targets baseFields + contract bulk fields", async () => {
    const result = await runRefresh(makeStrategy(), {
      baseFields: ["summary"],
      isPerField: false,
      config: CONFIG,
    });
    expect(result).toBe("RESULT");
    const callArg = vi.mocked(runRefine).mock.calls[0]![0] as { target?: string[] };
    expect(callArg.target).toEqual(["summary", "pairings", "language"]);
  });

  test("full run dedupes a base field that is also flagged bulk", async () => {
    await runRefresh(makeStrategy(), {
      baseFields: ["summary", "pairings"],
      isPerField: false,
      config: CONFIG,
    });
    const callArg = vi.mocked(runRefine).mock.calls[0]![0] as { target?: string[] };
    expect(callArg.target).toEqual(["summary", "pairings", "language"]);
  });

  test("per-field run targets baseFields only — no bulk fields", async () => {
    await runRefresh(makeStrategy(), {
      baseFields: ["summary"],
      isPerField: true,
      config: CONFIG,
    });
    const callArg = vi.mocked(runRefine).mock.calls[0]![0] as { target?: string[] };
    expect(callArg.target).toEqual(["summary"]);
  });
});

describe("runRefresh: error handling", () => {
  test("throws when runRefine yields only errors and no suggestions", async () => {
    vi.mocked(runRefine).mockResolvedValueOnce({
      suggestions: new Map(),
      autoApplied: new Map(),
      traces: new Map(),
      errors: new Map([["summary", { field: "summary", message: "boom", name: "Err" }]]),
    });
    await expect(
      runRefresh(makeStrategy(), { baseFields: ["summary"], isPerField: false, config: CONFIG }),
    ).rejects.toThrow("AI suggest failed for summary: boom");
  });

  test("does not throw when errors coexist with at least one suggestion", async () => {
    vi.mocked(runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "summary",
          {
            kind: "single",
            value: "ok",
            confidence: "high",
            summary: "s",
            hash: "h",
            traceId: "t",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
      errors: new Map([["tags", { field: "tags", message: "boom", name: "Err" }]]),
    });
    await expect(
      runRefresh(makeStrategy(), { baseFields: ["summary"], isPerField: false, config: CONFIG }),
    ).resolves.toBe("RESULT");
  });
});

describe("runRefresh: events", () => {
  test("passes the strategy's events to runRefine for suppression", async () => {
    const events = [
      { type: "rejected", suggestion: { hash: "h", summary: "s" }, at: "", model: "m" },
    ];
    await runRefresh(makeStrategy({ events }), {
      baseFields: ["summary"],
      isPerField: false,
      config: CONFIG,
    });
    const callArg = vi.mocked(runRefine).mock.calls[0]![0] as { events?: unknown };
    expect(callArg.events).toBe(events);
  });
});

describe("runRefresh: improvement extraction", () => {
  test("assemble receives one rawImprovement per base field with a single suggestion", async () => {
    vi.mocked(runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "summary",
          {
            kind: "single",
            value: "A summary",
            confidence: "high",
            summary: "summary: A summary",
            hash: "h1",
            traceId: "t1",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
      errors: new Map(),
    });
    const strategy = makeStrategy();
    await runRefresh(strategy, {
      baseFields: ["summary", "description"],
      isPerField: false,
      config: CONFIG,
    });
    const arg = vi.mocked(strategy.assemble).mock.calls[0]![0];
    expect(arg.rawImprovements).toEqual([
      {
        field: "summary",
        suggestion: "A summary",
        summary: "summary: A summary",
        hash: "h1",
        traceId: "t1",
        confidence: "high",
      },
    ]);
    expect(arg.isPerField).toBe(false);
  });

  test("assemble receives the per-field errors map from runRefine", async () => {
    const errors = new Map([["tags", { field: "tags", message: "boom", name: "Err" }]]);
    vi.mocked(runRefine).mockResolvedValueOnce({
      suggestions: new Map([
        [
          "summary",
          {
            kind: "single",
            value: "ok",
            confidence: "high",
            summary: "s",
            hash: "h",
            traceId: "t",
          },
        ],
      ]),
      autoApplied: new Map(),
      traces: new Map(),
      errors,
    });
    const strategy = makeStrategy();
    await runRefresh(strategy, { baseFields: ["summary"], isPerField: false, config: CONFIG });
    const arg = vi.mocked(strategy.assemble).mock.calls[0]![0];
    expect(arg.errors).toBe(errors);
  });
});
