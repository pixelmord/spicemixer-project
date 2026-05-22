import { describe, expect, test, vi, beforeEach, afterEach } from "vite-plus/test";
import { generateText } from "ai";
import { createProvider, generateTraceId, tracingMiddleware, withOrigin } from "../src/server.ts";
import type { TraceSink, TraceEvent } from "../src/trace.ts";
import type { Origin } from "../src/origin.ts";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";

const BASE_ORIGIN: Origin = {
  surface: "admin",
  action: "test",
  triggeredBy: "editor",
  userInitiated: true,
  runId: "run-trace-1",
};

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "gpt-test" };

// ─── generateTraceId ─────────────────────────────────────────────────────────

describe("generateTraceId", () => {
  test("returns a non-empty string", () => {
    const id = generateTraceId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("each call returns a unique id", () => {
    const ids = Array.from({ length: 5 }, () => generateTraceId());
    const unique = new Set(ids);
    expect(unique.size).toBe(5);
  });
});

// ─── tracingMiddleware ────────────────────────────────────────────────────────

function makeMockModel(id = "test-model"): LanguageModelV3 {
  return { modelId: id, provider: "test" } as unknown as LanguageModelV3;
}

function makeParams(): LanguageModelV3CallOptions {
  return {
    prompt: [
      { role: "system", content: "You are helpful." },
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ],
  } as unknown as LanguageModelV3CallOptions;
}

function makeGenerateResult(text = "Hi there"): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    },
    warnings: [],
  } as unknown as LanguageModelV3GenerateResult;
}

describe("tracingMiddleware", () => {
  test("returns middleware with specificationVersion v3", () => {
    const mw = tracingMiddleware([]);
    expect(mw.specificationVersion).toBe("v3");
  });

  test("has wrapGenerate and wrapStream", () => {
    const mw = tracingMiddleware([]);
    expect(typeof mw.wrapGenerate).toBe("function");
    expect(typeof mw.wrapStream).toBe("function");
  });

  test("is a no-op when no Origin in context", async () => {
    const emitted: TraceEvent[] = [];
    const sink: TraceSink = {
      emit: (e) => {
        emitted.push(e);
      },
    };
    const mw = tracingMiddleware([sink]);
    const result = makeGenerateResult();
    const doGenerate = vi.fn().mockResolvedValue(result);

    const out = await mw.wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: makeParams(),
      model: makeMockModel(),
    });

    expect(out).toBe(result);
    expect(emitted).toHaveLength(0);
  });

  test("emits one TraceEvent per wrapGenerate call with origin in context", async () => {
    const emitted: TraceEvent[] = [];
    const sink: TraceSink = {
      emit: (e) => {
        emitted.push(e);
      },
    };
    const mw = tracingMiddleware([sink]);
    const doGenerate = vi.fn().mockResolvedValue(makeGenerateResult());

    await withOrigin(BASE_ORIGIN, () =>
      mw.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params: makeParams(),
        model: makeMockModel(),
      }),
    );

    expect(emitted).toHaveLength(1);
    const ev = emitted[0]!;
    expect(ev.runId).toBe("run-trace-1");
    expect(ev.model).toBe("test-model");
    expect(ev.finishReason).toBe("stop");
    expect(ev.result.text).toBe("Hi there");
    expect(ev.origin).toEqual(BASE_ORIGIN);
    expect(typeof ev.traceId).toBe("string");
    expect(ev.error).toBeUndefined();
  });
});

// ─── createProvider with sinks ───────────────────────────────────────────────

describe("createProvider with sinks", () => {
  beforeEach(() => {
    process.env["AI_PROVIDER"] = "mock";
  });

  afterEach(() => {
    delete process.env["AI_PROVIDER"];
  });

  test("wraps model and emits trace events when origin is in context", async () => {
    const emitted: TraceEvent[] = [];
    const sink: TraceSink = {
      emit: (e) => {
        emitted.push(e);
      },
    };
    const model = createProvider(MOCK_CONFIG, { sinks: [sink] });

    await withOrigin(BASE_ORIGIN, () => generateText({ model, prompt: "test" }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.runId).toBe("run-trace-1");
  });

  test("does not emit trace events when no origin in context", async () => {
    const emitted: TraceEvent[] = [];
    const sink: TraceSink = {
      emit: (e) => {
        emitted.push(e);
      },
    };
    const model = createProvider(MOCK_CONFIG, { sinks: [sink] });

    await generateText({ model, prompt: "test" });

    expect(emitted).toHaveLength(0);
  });

  test("returns model without wrapping when no sinks provided", () => {
    const model = createProvider(MOCK_CONFIG);
    expect(model).toBeDefined();
  });

  test("returns model without wrapping when empty sinks array provided", () => {
    const model = createProvider(MOCK_CONFIG, { sinks: [] });
    expect(model).toBeDefined();
  });
});
