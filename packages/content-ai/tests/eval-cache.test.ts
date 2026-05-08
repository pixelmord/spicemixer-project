import { describe, expect, test, beforeEach, afterEach } from "vite-plus/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonlCache, hashPrompt } from "../evals/cache.ts";
import type { TraceRecord } from "../evals/cache.ts";

function makeTraceRecord(prompt: string, overrides: Partial<TraceRecord> = {}): TraceRecord {
  return {
    traceId: "trace-1",
    runId: "run-1",
    at: new Date().toISOString(),
    origin: {
      surface: "test",
      action: "test",
      userInitiated: false,
      runId: "run-1",
      triggeredBy: "system",
    },
    model: "test-model",
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20 },
    durationMs: 100,
    params: { prompt },
    result: { parsedObject: { name: "Test Recipe", recipeIngredient: [], recipeInstructions: [] } },
    ...overrides,
  };
}

let dir: string;

beforeEach(async () => {
  dir = join(tmpdir(), `evalite-cache-test-${Date.now()}`);
  await mkdir(dir, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("JsonlCache", () => {
  test("happy-path lookup returns matching record", async () => {
    const prompt = "Extract the recipe from the following text:\n\nMiso Ramen recipe";
    const record = makeTraceRecord(prompt);
    await writeFile(join(dir, "2026-01-01.jsonl"), JSON.stringify(record) + "\n", "utf8");

    const cache = new JsonlCache(dir);
    const found = await cache.lookup(hashPrompt(prompt));
    expect(found).not.toBeNull();
    expect(found?.traceId).toBe("trace-1");
  });

  test("miss returns null for unknown hash", async () => {
    const record = makeTraceRecord("some prompt");
    await writeFile(join(dir, "2026-01-01.jsonl"), JSON.stringify(record) + "\n", "utf8");

    const cache = new JsonlCache(dir);
    expect(await cache.lookup("deadbeef".repeat(8))).toBeNull();
  });

  test("returns null when .ai-trace dir does not exist", async () => {
    const cache = new JsonlCache(join(dir, "does-not-exist"));
    expect(await cache.lookup("anykey")).toBeNull();
  });

  test("malformed line is skipped, good lines still indexed", async () => {
    const prompt = "good prompt";
    const good = makeTraceRecord(prompt);
    const content = ["{ broken json <<<", JSON.stringify(good), ""].join("\n");
    await writeFile(join(dir, "2026-01-01.jsonl"), content, "utf8");

    const cache = new JsonlCache(dir);
    expect(await cache.lookup(hashPrompt(prompt))).not.toBeNull();
  });

  test("indexes records from multiple .jsonl files", async () => {
    const p1 = "prompt one";
    const p2 = "prompt two";
    await writeFile(
      join(dir, "2026-01-01.jsonl"),
      JSON.stringify(makeTraceRecord(p1, { traceId: "t1" })) + "\n",
      "utf8",
    );
    await writeFile(
      join(dir, "2026-01-02.jsonl"),
      JSON.stringify(makeTraceRecord(p2, { traceId: "t2" })) + "\n",
      "utf8",
    );

    const cache = new JsonlCache(dir);
    expect((await cache.lookup(hashPrompt(p1)))?.traceId).toBe("t1");
    expect((await cache.lookup(hashPrompt(p2)))?.traceId).toBe("t2");
  });

  test("non-.jsonl files are ignored", async () => {
    await writeFile(join(dir, "notes.txt"), "not jsonl content", "utf8");
    const cache = new JsonlCache(dir);
    expect(await cache.lookup("anything")).toBeNull();
  });

  test("first record wins for duplicate prompt hash", async () => {
    const prompt = "duplicate prompt";
    const r1 = makeTraceRecord(prompt, { traceId: "first" });
    const r2 = makeTraceRecord(prompt, { traceId: "second" });
    await writeFile(
      join(dir, "2026-01-01.jsonl"),
      [JSON.stringify(r1), JSON.stringify(r2)].join("\n") + "\n",
      "utf8",
    );

    const cache = new JsonlCache(dir);
    expect((await cache.lookup(hashPrompt(prompt)))?.traceId).toBe("first");
  });

  test("records without params.prompt are not indexed", async () => {
    const record = makeTraceRecord("irrelevant") as TraceRecord & { params: { prompt?: string } };
    delete record.params.prompt;
    await writeFile(join(dir, "2026-01-01.jsonl"), JSON.stringify(record) + "\n", "utf8");

    const cache = new JsonlCache(dir);
    expect(await cache.lookup(hashPrompt("irrelevant"))).toBeNull();
  });
});

describe("hashPrompt", () => {
  test("same string produces same hash", () => {
    expect(hashPrompt("hello")).toBe(hashPrompt("hello"));
  });

  test("different strings produce different hashes", () => {
    expect(hashPrompt("hello")).not.toBe(hashPrompt("world"));
  });
});
