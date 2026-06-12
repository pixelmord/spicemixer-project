import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { z } from "zod";
import type { MessageSet, SiblingLocaleSource } from "../src/types.ts";
import { MERGE_INSTRUCTION } from "../src/run-fill.ts";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn().mockReturnValue({}) },
}));

vi.mock("@pixelmord/content-ai-core/server", () => ({
  createProvider: vi.fn().mockReturnValue({}),
  PROVIDER_OPTIONS: { openai: { strictJsonSchema: false } },
}));

const { generateText } = await import("ai");
const { runFill } = await import("../src/run-fill.ts");
const { createProvider } = await import("@pixelmord/content-ai-core/server");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "gpt-test" };

const testSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

type TextSource = { kind: "text"; content: string };
type PdfSource = { kind: "pdf"; text: string };
type ImageSource = { kind: "image"; bytes: Uint8Array; mimeType: string };
type TestSource = TextSource | PdfSource | ImageSource | SiblingLocaleSource;

const makeContract = (buildMessages?: (s: TestSource) => Promise<MessageSet>) => ({
  schema: testSchema,
  systemPrompt: "You are an extractor.",
  buildMessages:
    buildMessages ??
    (async (s: TestSource): Promise<MessageSet> => {
      if (s.kind === "text") return { prompt: s.content };
      if (s.kind === "pdf") return { prompt: s.text };
      if (s.kind === "sibling-locale") return { prompt: "Translate the following content." };
      return {
        messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "image" }] }],
      };
    }),
});

const FIXTURE_OUTPUT = { name: "Basil", description: "Aromatic herb", tags: ["herb", "fresh"] };

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Cold-fill pattern ─────────────────────────────────────────────────────────

describe("runFill — cold-fill (no currentData)", () => {
  test("returns suggestions Map for all non-null fields", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "Basil is an herb." } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(result.suggestions.size).toBe(3);
    expect(result.suggestions.get("name")).toMatchObject({ kind: "single", value: "Basil" });
    expect(result.suggestions.get("description")).toMatchObject({
      kind: "single",
      value: "Aromatic herb",
    });
    expect(result.suggestions.get("tags")).toMatchObject({
      kind: "single",
      value: ["herb", "fresh"],
    });
  });

  test("each suggestion has a traceId and hash", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    for (const suggestion of result.suggestions.values()) {
      expect(suggestion.kind).toBe("single");
      if (suggestion.kind === "single") {
        expect(typeof suggestion.traceId).toBe("string");
        expect(suggestion.traceId.length).toBeGreaterThan(0);
        expect(typeof suggestion.hash).toBe("string");
        expect(suggestion.hash.length).toBe(12);
      }
    }
  });

  test("all suggestions share the same traceId", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    const traceIds = [...result.suggestions.values()]
      .filter((s) => s.kind === "single")
      .map((s) => (s as { kind: "single"; traceId: string }).traceId);
    const unique = new Set(traceIds);
    expect(unique.size).toBe(1);
  });

  test("omits null/undefined fields from suggestions", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { name: "Basil", description: null, tags: undefined },
    } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(result.suggestions.has("description")).toBe(false);
    expect(result.suggestions.has("tags")).toBe(false);
    expect(result.suggestions.has("name")).toBe(true);
  });

  test("autoApplied is empty (no event log integration)", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(result.autoApplied.size).toBe(0);
  });
});

// ── Merge pattern ─────────────────────────────────────────────────────────────

describe("runFill — merge (with currentData)", () => {
  test("fill-if-empty: skips fields that already have a value in currentData", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
      currentData: { name: "Existing Name" },
      writePolicy: "fill-if-empty",
    });

    // name is already set → skipped
    expect(result.suggestions.has("name")).toBe(false);
    // description is absent → included
    expect(result.suggestions.has("description")).toBe(true);
  });

  test("preserve: skips every field that has a value in currentData", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
      currentData: { name: "Existing", description: "Existing desc" },
      writePolicy: "preserve",
    });

    expect(result.suggestions.has("name")).toBe(false);
    expect(result.suggestions.has("description")).toBe(false);
    // tags not in currentData → still proposed
    expect(result.suggestions.has("tags")).toBe(true);
  });

  test("replace: always proposes even when currentData has a value", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
      currentData: { name: "Old Name" },
      writePolicy: "replace",
    });

    expect(result.suggestions.has("name")).toBe(true);
    expect(result.suggestions.get("name")).toMatchObject({ value: "Basil" });
  });

  test("default policy with currentData is fill-if-empty", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
      currentData: { name: "Already Set" },
    });

    expect(result.suggestions.has("name")).toBe(false);
    expect(result.suggestions.has("description")).toBe(true);
  });
});

// ── Hybrid pattern ────────────────────────────────────────────────────────────

describe("runFill — hybrid (partial currentData with per-field policies)", () => {
  test("per-field policy overrides call-level writePolicy", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
      currentData: { name: "Old", description: "Old desc" },
      writePolicy: "preserve",
      fieldPolicies: { name: "replace" },
    });

    // name: per-field replace overrides call-level preserve
    expect(result.suggestions.has("name")).toBe(true);
    expect(result.suggestions.get("name")).toMatchObject({ value: "Basil" });
    // description: call-level preserve applies
    expect(result.suggestions.has("description")).toBe(false);
  });

  test("contract fieldPolicies act as baseline when no call-level policy", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const contractWithPolicies = {
      ...makeContract(),
      fieldPolicies: { name: "preserve" as const },
    };

    const result = await runFill({
      contract: contractWithPolicies,
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
      currentData: { name: "Existing" },
    });

    expect(result.suggestions.has("name")).toBe(false);
    expect(result.suggestions.has("description")).toBe(true);
  });
});

// ── Source-type union dispatch ─────────────────────────────────────────────────

describe("runFill — source-type union dispatch", () => {
  test("text source: buildMessages receives the source context and prompt is passed to generateText", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basil" } } as never);

    const buildMessages = vi.fn().mockResolvedValue({ prompt: "Extract from: hello" });
    const contract = { schema: testSchema, systemPrompt: "sys", buildMessages };

    await runFill({
      contract,
      sourceContext: { kind: "text", content: "hello" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(buildMessages).toHaveBeenCalledWith({ kind: "text", content: "hello" });
    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toBe("Extract from: hello");
  });

  test("PDF source: buildMessages receives PDF source and returns prompt from extracted text", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Cumin" } } as never);

    const buildMessages = vi.fn().mockResolvedValue({
      prompt: "Extract from: cumin text",
      warnings: ["large PDF"],
    });
    const contract = { schema: testSchema, systemPrompt: "sys", buildMessages };

    const result = await runFill({
      contract,
      sourceContext: { kind: "pdf", text: "cumin text" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(buildMessages).toHaveBeenCalledWith({ kind: "pdf", text: "cumin text" });
    expect(result.warnings).toContain("large PDF");
  });

  test("image source: buildMessages receives image source and returns messages array", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Saffron" } } as never);

    const imageMessages = [
      { role: "user", content: [{ type: "image", image: new Uint8Array([1]) }] },
    ];
    const buildMessages = vi.fn().mockResolvedValue({ messages: imageMessages });
    const contract = { schema: testSchema, systemPrompt: "sys", buildMessages };

    await runFill({
      contract,
      sourceContext: {
        kind: "image",
        bytes: new Uint8Array([1]),
        mimeType: "image/jpeg",
      } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(buildMessages).toHaveBeenCalledWith({
      kind: "image",
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
    });
    const call = vi.mocked(generateText).mock.calls[0][0] as { messages: unknown[] };
    expect(call.messages).toEqual(imageMessages);
  });

  test("forwards warnings from buildMessages to the result", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Cumin" } } as never);

    const buildMessages = vi.fn().mockResolvedValue({
      prompt: "x",
      warnings: ["scanned PDF — using vision model"],
    });

    const result = await runFill({
      contract: { schema: testSchema, systemPrompt: "sys", buildMessages },
      sourceContext: { kind: "pdf", text: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(result.warnings).toEqual(["scanned PDF — using vision model"]);
  });
});

// ── ingestedEvent shape ────────────────────────────────────────────────────────

describe("ingestedEvent shape", () => {
  test("type is 'ingested'", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const { ingestedEvent } = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(ingestedEvent.type).toBe("ingested");
  });

  test("at is an ISO 8601 timestamp", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const { ingestedEvent } = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(new Date(ingestedEvent.at).toISOString()).toBe(ingestedEvent.at);
  });

  test("model matches config.model", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const { ingestedEvent } = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(ingestedEvent.model).toBe("gpt-test");
  });

  test("suggestion.hash is a 12-char hex string", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const { ingestedEvent } = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(ingestedEvent.suggestion.hash).toMatch(/^[0-9a-f]{12}$/);
  });

  test("suggestion.summary describes the number of fields proposed", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const { ingestedEvent } = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(ingestedEvent.suggestion.summary).toMatch(/Fill:/);
    expect(ingestedEvent.suggestion.summary).toMatch(/proposed/);
  });

  test("traceId is propagated to ingestedEvent", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(typeof result.ingestedEvent.traceId).toBe("string");
    // traceId in ingestedEvent matches the one in traces map
    expect(result.traces.has(result.ingestedEvent.traceId!)).toBe(true);
  });
});

// ── Trace map ────────────────────────────────────────────────────────────────

describe("runFill — traces", () => {
  test("traces map has one entry per runFill call", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(result.traces.size).toBe(1);
  });

  test("trace summary includes model and runtimeMs", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
    });

    const [summary] = result.traces.values();
    expect(summary.model).toBe("gpt-test");
    expect(typeof summary.runtimeMs).toBe("number");
    expect(summary.runtimeMs).toBeGreaterThanOrEqual(0);
  });

  test("preset is included in trace when provided", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "x" } as TestSource,
      config: MOCK_CONFIG,
      preset: "expand",
    });

    const [summary] = result.traces.values();
    expect(summary.preset).toBe("expand");
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("runFill — errors", () => {
  test("propagates errors from generateText to the caller", async () => {
    const original = new Error("network failure");
    vi.mocked(generateText).mockRejectedValue(original);

    await expect(
      runFill({
        contract: makeContract(),
        sourceContext: { kind: "text", content: "x" } as TestSource,
        config: MOCK_CONFIG,
      }),
    ).rejects.toBe(original);
  });
});

// ── Sibling-locale source dispatch ────────────────────────────────────────────

const makeSiblingSource = (sourceData: Record<string, unknown> = {}): SiblingLocaleSource => ({
  kind: "sibling-locale",
  sourceRef: { id: "en-basil", kind: "ingredient" },
  sourceData,
  sourceLocale: "en",
  targetLocale: "de",
  fieldHashes: {},
});

describe("runFill — sibling-locale source", () => {
  test("copy fields are taken from sourceData without calling generateText", async () => {
    const contract = {
      ...makeContract(),
      fieldConfigs: {
        name: { translation: { mode: "copy" as const } },
        description: { translation: { mode: "copy" as const } },
        tags: { translation: { mode: "copy" as const } },
      },
    };

    const result = await runFill({
      contract,
      sourceContext: makeSiblingSource({
        name: "Basil",
        description: "Aromatic herb",
        tags: ["herb"],
      }),
      config: MOCK_CONFIG,
    });

    expect(vi.mocked(generateText)).not.toHaveBeenCalled();
    expect(result.suggestions.get("name")).toMatchObject({ kind: "single", value: "Basil" });
    expect(result.suggestions.get("description")).toMatchObject({
      kind: "single",
      value: "Aromatic herb",
    });
    expect(result.suggestions.get("tags")).toMatchObject({ kind: "single", value: ["herb"] });
  });

  test("skip fields are omitted from suggestions", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    const contract = {
      ...makeContract(),
      fieldConfigs: {
        name: { translation: { mode: "translate" as const } },
        description: { translation: { mode: "skip" as const } },
      },
    };

    const result = await runFill({
      contract,
      sourceContext: makeSiblingSource({ name: "Basil", description: "Aromatic herb" }),
      config: MOCK_CONFIG,
    });

    expect(result.suggestions.has("description")).toBe(false);
    expect(result.suggestions.has("name")).toBe(true);
  });

  test("translate fields are proposed via LLM", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    const contract = {
      ...makeContract(),
      fieldConfigs: {
        name: { translation: { mode: "translate" as const } },
      },
    };

    const result = await runFill({
      contract,
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
    });

    expect(vi.mocked(generateText)).toHaveBeenCalledOnce();
    expect(result.suggestions.get("name")).toMatchObject({ kind: "single", value: "Basilikum" });
  });

  test("localize fields are proposed via LLM", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { tags: ["Gewürz"] } } as never);

    const contract = {
      ...makeContract(),
      fieldConfigs: {
        tags: { translation: { mode: "localize" as const } },
      },
    };

    const result = await runFill({
      contract,
      sourceContext: makeSiblingSource({ tags: ["herb"] }),
      config: MOCK_CONFIG,
    });

    expect(vi.mocked(generateText)).toHaveBeenCalledOnce();
    expect(result.suggestions.get("tags")).toMatchObject({ kind: "single", value: ["Gewürz"] });
  });

  test("mixed mode: copy + translate + skip in one call", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { name: "Basilikum", description: "Aromatisches Kraut" },
    } as never);

    const contract = {
      ...makeContract(),
      fieldConfigs: {
        name: { translation: { mode: "translate" as const } },
        description: { translation: { mode: "translate" as const } },
        tags: { translation: { mode: "copy" as const } },
      },
    };

    const result = await runFill({
      contract,
      sourceContext: makeSiblingSource({
        name: "Basil",
        description: "Aromatic herb",
        tags: ["herb", "fresh"],
      }),
      config: MOCK_CONFIG,
    });

    expect(vi.mocked(generateText)).toHaveBeenCalledOnce();
    expect(result.suggestions.get("name")).toMatchObject({ value: "Basilikum" });
    expect(result.suggestions.get("description")).toMatchObject({ value: "Aromatisches Kraut" });
    expect(result.suggestions.get("tags")).toMatchObject({ value: ["herb", "fresh"] });
  });

  test("autoApplied is always empty (hard-rule: never)", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
    });

    expect(result.autoApplied.size).toBe(0);
  });

  test("fields with no fieldConfig entry default to translate mode (LLM called)", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    const contract = { ...makeContract(), fieldConfigs: {} };

    const result = await runFill({
      contract,
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
    });

    expect(vi.mocked(generateText)).toHaveBeenCalledOnce();
    expect(result.suggestions.get("name")).toMatchObject({ value: "Basilikum" });
  });

  test("null/undefined values in sourceData are omitted from copy suggestions", async () => {
    const contract = {
      ...makeContract(),
      fieldConfigs: {
        name: { translation: { mode: "copy" as const } },
        description: { translation: { mode: "copy" as const } },
      },
    };

    const result = await runFill({
      contract,
      sourceContext: makeSiblingSource({ name: "Basil", description: null }),
      config: MOCK_CONFIG,
    });

    expect(result.suggestions.has("name")).toBe(true);
    expect(result.suggestions.has("description")).toBe(false);
  });

  test("emits a single ingestedEvent for the whole operation", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
    });

    expect(result.ingestedEvent.type).toBe("ingested");
    expect(result.ingestedEvent.model).toBe("gpt-test");
    expect(result.ingestedEvent.suggestion.hash).toMatch(/^[0-9a-f]{12}$/);
  });

  test("traces map has one entry for sibling-locale call", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    const result = await runFill({
      contract: makeContract(),
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
    });

    expect(result.traces.size).toBe(1);
  });
});

// ── mergeInstruction ─────────────────────────────────────────────────────────

describe("runFill — mergeInstruction (sibling-locale)", () => {
  const translateContract = {
    ...makeContract(),
    fieldConfigs: {
      name: { translation: { mode: "translate" as const } },
      description: { translation: { mode: "translate" as const } },
    },
  };

  test("empty target: mergeInstruction is prepended when no userPrompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    await runFill({
      contract: translateContract,
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
      mergeInstruction: MERGE_INSTRUCTION,
    });

    const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
    // effectivePrompt is built inside callLlm from messageSet.prompt + userPrompt
    // mergeInstruction becomes the userPrompt passed to callLlm
    const promptArg = (call.prompt as string) ?? "";
    expect(promptArg).toContain(MERGE_INSTRUCTION);
  });

  test("short target: mergeInstruction precedes the field-specific user-message", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    const fieldPrompt = "Use formal register.";
    await runFill({
      contract: translateContract,
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
      mergeInstruction: MERGE_INSTRUCTION,
      userPrompt: fieldPrompt,
    });

    const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
    const promptArg = (call.prompt as string) ?? "";
    // mergeInstruction should appear before fieldPrompt
    const mergeIdx = promptArg.indexOf(MERGE_INSTRUCTION);
    const fieldIdx = promptArg.indexOf(fieldPrompt);
    expect(mergeIdx).toBeGreaterThanOrEqual(0);
    expect(fieldIdx).toBeGreaterThan(mergeIdx);
  });

  test("long target: mergeInstruction + long user prompt combined correctly", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    const longPrompt = "A".repeat(500);
    await runFill({
      contract: translateContract,
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
      mergeInstruction: MERGE_INSTRUCTION,
      userPrompt: longPrompt,
    });

    const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
    const promptArg = (call.prompt as string) ?? "";
    expect(promptArg).toContain(MERGE_INSTRUCTION);
    expect(promptArg).toContain(longPrompt);
    expect(promptArg.indexOf(MERGE_INSTRUCTION)).toBeLessThan(promptArg.indexOf(longPrompt));
  });

  test("non-sibling-locale source silently ignores mergeInstruction", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basil" } } as never);

    await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "Basil is an herb." } as TestSource,
      config: MOCK_CONFIG,
      mergeInstruction: MERGE_INSTRUCTION,
    });

    // generateText is still called (normal path), no error thrown
    expect(vi.mocked(generateText)).toHaveBeenCalledOnce();
    // the mergeInstruction does NOT appear in the prompt for non-sibling sources
    const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
    const promptArg = (call.prompt as string) ?? "";
    expect(promptArg).not.toContain(MERGE_INSTRUCTION);
  });

  test("mergeInstruction is recorded in the trace when set on sibling-locale run", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    const result = await runFill({
      contract: translateContract,
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
      mergeInstruction: MERGE_INSTRUCTION,
    });

    const [trace] = result.traces.values();
    expect(trace.mergeInstruction).toBe(MERGE_INSTRUCTION);
  });

  test("trace omits mergeInstruction when not set", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { name: "Basilikum" } } as never);

    const result = await runFill({
      contract: translateContract,
      sourceContext: makeSiblingSource({ name: "Basil" }),
      config: MOCK_CONFIG,
    });

    const [trace] = result.traces.values();
    expect(trace.mergeInstruction).toBeUndefined();
  });
});

// ── Sinks threading ───────────────────────────────────────────────────────────

describe("runFill — sinks threading", () => {
  test("passes sinks to createProvider when provided in params", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);
    const sink = { emit: vi.fn() };

    await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "Basil is an herb." } as TestSource,
      config: MOCK_CONFIG,
      sinks: [sink],
    });

    expect(vi.mocked(createProvider)).toHaveBeenCalledWith(MOCK_CONFIG, { sinks: [sink] });
  });

  test("passes undefined for options when no sinks provided", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_OUTPUT } as never);

    await runFill({
      contract: makeContract(),
      sourceContext: { kind: "text", content: "Basil is an herb." } as TestSource,
      config: MOCK_CONFIG,
    });

    expect(vi.mocked(createProvider)).toHaveBeenCalledWith(MOCK_CONFIG, undefined);
  });
});
