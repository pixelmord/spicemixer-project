import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";

// ─── Origin / ALS ────────────────────────────────────────────────────────────

import { runWithOrigin, getCurrentOrigin, withOrigin } from "../src/trace/origin.ts";
import type { Origin } from "../src/trace/origin.ts";

const BASE_ORIGIN: Origin = {
  surface: "admin",
  action: "test",
  triggeredBy: "editor",
  userInitiated: true,
  runId: "run-1",
};

describe("runWithOrigin / getCurrentOrigin", () => {
  test("getCurrentOrigin returns undefined outside of runWithOrigin", () => {
    expect(getCurrentOrigin()).toBeUndefined();
  });

  test("getCurrentOrigin returns the origin inside runWithOrigin", async () => {
    let captured: Origin | undefined;
    await runWithOrigin(BASE_ORIGIN, async () => {
      captured = getCurrentOrigin();
    });
    expect(captured).toEqual(BASE_ORIGIN);
  });

  test("origin propagates across await boundaries", async () => {
    const results: Array<Origin | undefined> = [];
    await runWithOrigin(BASE_ORIGIN, async () => {
      await Promise.resolve();
      results.push(getCurrentOrigin());
      await new Promise<void>((r) => setTimeout(r, 1));
      results.push(getCurrentOrigin());
    });
    expect(results).toEqual([BASE_ORIGIN, BASE_ORIGIN]);
  });

  test("nested runWithOrigin uses inner origin", async () => {
    const inner: Origin = { ...BASE_ORIGIN, runId: "inner-run" };
    let captured: Origin | undefined;
    await runWithOrigin(BASE_ORIGIN, async () => {
      await runWithOrigin(inner, async () => {
        captured = getCurrentOrigin();
      });
    });
    expect(captured?.runId).toBe("inner-run");
  });
});

describe("withOrigin", () => {
  test("wraps handler and sets origin context", async () => {
    let capturedRunId: string | undefined;
    const handler = withOrigin({
      surface: "admin",
      action: "test",
      triggeredBy: "editor",
      userInitiated: true,
    })(async () => {
      capturedRunId = getCurrentOrigin()?.runId;
    });
    await handler();
    expect(capturedRunId).toBeDefined();
    expect(typeof capturedRunId).toBe("string");
  });

  test("generates a fresh runId per call when none provided", async () => {
    const ids: string[] = [];
    const handler = withOrigin({
      surface: "admin",
      action: "test",
      triggeredBy: "editor",
      userInitiated: true,
    })(async () => {
      const id = getCurrentOrigin()?.runId;
      if (id) ids.push(id);
    });
    await handler();
    await handler();
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  test("uses provided runId if given", async () => {
    let capturedRunId: string | undefined;
    const handler = withOrigin({
      surface: "admin",
      action: "test",
      triggeredBy: "editor",
      userInitiated: true,
      runId: "fixed-id",
    })(async () => {
      capturedRunId = getCurrentOrigin()?.runId;
    });
    await handler();
    expect(capturedRunId).toBe("fixed-id");
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────

import { tracingMiddleware } from "../src/trace/middleware.ts";
import type { TraceSink, TraceEvent } from "../src/trace/sinks/types.ts";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";

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

describe("tracingMiddleware — wrapGenerate", () => {
  let emitted: TraceEvent[] = [];
  let sink: TraceSink;

  beforeEach(() => {
    emitted = [];
    sink = {
      emit: async (e) => {
        emitted.push(e);
      },
    };
  });

  test("is a no-op when no Origin in context (passes through)", async () => {
    const middleware = tracingMiddleware([sink]);
    const result = makeGenerateResult();
    const doGenerate = vi.fn().mockResolvedValue(result);
    const out = await middleware.wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: makeParams(),
      model: makeMockModel(),
    });
    expect(out).toBe(result);
    expect(emitted).toHaveLength(0);
  });

  test("emits one TraceEvent per wrapGenerate call with origin in context", async () => {
    const middleware = tracingMiddleware([sink]);
    const doGenerate = vi.fn().mockResolvedValue(makeGenerateResult());

    await runWithOrigin(BASE_ORIGIN, () =>
      middleware.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params: makeParams(),
        model: makeMockModel(),
      }),
    );

    expect(emitted).toHaveLength(1);
    const ev = emitted[0]!;
    expect(ev.runId).toBe("run-1");
    expect(ev.model).toBe("test-model");
    expect(ev.finishReason).toBe("stop");
    expect(ev.usage.promptTokens).toBe(10);
    expect(ev.usage.completionTokens).toBe(5);
    expect(ev.result.text).toBe("Hi there");
    expect(ev.params.system).toBe("You are helpful.");
    expect(ev.params.prompt).toBe("Hello");
    expect(ev.origin).toEqual(BASE_ORIGIN);
    expect(typeof ev.traceId).toBe("string");
    expect(ev.error).toBeUndefined();
  });

  test("emits a trace event with error populated when doGenerate throws", async () => {
    const middleware = tracingMiddleware([sink]);
    const doGenerate = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      runWithOrigin(BASE_ORIGIN, () =>
        middleware.wrapGenerate!({
          doGenerate,
          doStream: vi.fn(),
          params: makeParams(),
          model: makeMockModel(),
        }),
      ),
    ).rejects.toThrow("boom");

    expect(emitted).toHaveLength(1);
    const ev = emitted[0]!;
    expect(ev.error?.message).toBe("boom");
    expect(ev.finishReason).toBe("error");
  });

  test("fans event to all sinks", async () => {
    const emitted2: TraceEvent[] = [];
    const sink2: TraceSink = {
      emit: async (e) => {
        emitted2.push(e);
      },
    };
    const middleware = tracingMiddleware([sink, sink2]);
    const doGenerate = vi.fn().mockResolvedValue(makeGenerateResult());

    await runWithOrigin(BASE_ORIGIN, () =>
      middleware.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params: makeParams(),
        model: makeMockModel(),
      }),
    );

    expect(emitted).toHaveLength(1);
    expect(emitted2).toHaveLength(1);
  });

  test("origin is embedded in the emitted event", async () => {
    const middleware = tracingMiddleware([sink]);
    const doGenerate = vi.fn().mockResolvedValue(makeGenerateResult());
    const origin: Origin = { ...BASE_ORIGIN, entityKind: "recipe", field: "description" };

    await runWithOrigin(origin, () =>
      middleware.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params: makeParams(),
        model: makeMockModel(),
      }),
    );

    expect(emitted[0]!.origin.entityKind).toBe("recipe");
    expect(emitted[0]!.origin.field).toBe("description");
  });
});

// ─── FileTraceSink ────────────────────────────────────────────────────────────

import { FileTraceSink } from "../src/trace/sinks/file.ts";

const FIXTURE_EVENT: TraceEvent = {
  traceId: "t1",
  runId: "r1",
  at: "2024-01-15T10:00:00.000Z",
  origin: BASE_ORIGIN,
  model: "gpt-4o-mini",
  finishReason: "stop",
  usage: { promptTokens: 5, completionTokens: 3 },
  durationMs: 100,
  params: { system: "sys", prompt: "hi" },
  result: { text: "hello" },
};

describe("FileTraceSink", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `trace-test-${crypto.randomUUID()}`);
  });

  test("writes a JSONL line to YYYY-MM-DD.jsonl", async () => {
    const sink = new FileTraceSink(dir);
    await sink.emit(FIXTURE_EVENT);
    const content = await readFile(join(dir, "2024-01-15.jsonl"), "utf8");
    const line = JSON.parse(content.trim()) as TraceEvent;
    expect(line.traceId).toBe("t1");
    expect(line.model).toBe("gpt-4o-mini");
    expect(line.result.text).toBe("hello");
    await rm(dir, { recursive: true, force: true });
  });

  test("appends multiple events as separate lines", async () => {
    const sink = new FileTraceSink(dir);
    await sink.emit(FIXTURE_EVENT);
    await sink.emit({ ...FIXTURE_EVENT, traceId: "t2" });
    const content = await readFile(join(dir, "2024-01-15.jsonl"), "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[1]!) as TraceEvent).traceId).toBe("t2");
    await rm(dir, { recursive: true, force: true });
  });

  test("lazily creates the directory", async () => {
    const nested = join(dir, "a", "b", "c");
    const sink = new FileTraceSink(nested);
    await sink.emit(FIXTURE_EVENT);
    const content = await readFile(join(nested, "2024-01-15.jsonl"), "utf8");
    expect(content).toContain("t1");
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── aiEvents schema backward compat ─────────────────────────────────────────

import { aiEventSchema } from "../src/schemas/ai-events.ts";

describe("aiEventSchema backward compatibility", () => {
  const base = {
    type: "accepted" as const,
    suggestion: { hash: "abc", summary: "test" },
    at: "2024-01-01T00:00:00Z",
    model: "gpt-4o-mini",
  };

  test("old events without traceId still validate", () => {
    const result = aiEventSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  test("new events with traceId validate", () => {
    const result = aiEventSchema.safeParse({ ...base, traceId: "some-trace-id" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.traceId).toBe("some-trace-id");
  });
});
