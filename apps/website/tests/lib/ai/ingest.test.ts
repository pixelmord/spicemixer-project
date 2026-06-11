import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

vi.mock("@pixelmord/content-ai-ingest", () => ({
  runFill: vi.fn(),
}));

vi.mock("@/lib/pdf.ts", () => ({
  extractPdfContent: vi.fn(),
}));

const { runFill } = await import("@pixelmord/content-ai-ingest");
const { extractPdfContent } = await import("@/lib/pdf.ts");
const { ingestFields, resolvePdf } = await import("@/lib/ai/ingest.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };
const STUB_CONTRACT = { schema: {}, systemPrompt: "", buildMessages: async () => ({ prompt: "" }) };

function makeRunFillResult(
  suggestions: Array<[string, { kind: string; value?: unknown }]>,
  warnings: string[] = [],
) {
  return {
    suggestions: new Map(
      suggestions.map(([k, s]) => [
        k,
        { confidence: "medium", summary: k, hash: k, traceId: "t", ...s },
      ]),
    ),
    autoApplied: new Map(),
    traces: new Map(),
    ingestedEvent: {
      type: "ingested",
      at: "",
      model: "test",
      suggestion: { hash: "", summary: "" },
    },
    warnings,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingestFields", () => {
  test("builds a fields record from single-valued suggestions", async () => {
    vi.mocked(runFill).mockResolvedValue(
      makeRunFillResult([
        ["name", { kind: "single", value: "Cumin" }],
        ["category", { kind: "single", value: "spice" }],
      ]) as never,
    );

    const { fields } = await ingestFields(
      STUB_CONTRACT as never,
      { kind: "text" } as never,
      MOCK_CONFIG,
    );

    expect(fields).toEqual({ name: "Cumin", category: "spice" });
  });

  test("skips suggestions that are not single-valued", async () => {
    vi.mocked(runFill).mockResolvedValue(
      makeRunFillResult([
        ["name", { kind: "single", value: "Cumin" }],
        ["aliases", { kind: "multi", value: ["x"] }],
      ]) as never,
    );

    const { fields } = await ingestFields(STUB_CONTRACT as never, {} as never, MOCK_CONFIG);

    expect(fields).toEqual({ name: "Cumin" });
  });

  test("passes runFill warnings straight through", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult([], ["heads up"]) as never);

    const { warnings } = await ingestFields(STUB_CONTRACT as never, {} as never, MOCK_CONFIG);

    expect(warnings).toEqual(["heads up"]);
  });

  test("forwards contract, sourceContext, and config to runFill", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult([]) as never);
    const source = { kind: "text", content: "hi" };

    await ingestFields(STUB_CONTRACT as never, source as never, MOCK_CONFIG);

    const call = vi.mocked(runFill).mock.calls[0][0];
    expect(call.contract).toBe(STUB_CONTRACT);
    expect(call.sourceContext).toBe(source);
    expect(call.config).toBe(MOCK_CONFIG);
  });
});

describe("resolvePdf", () => {
  test("text PDF resolves to text with no warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "hi",
      pageCount: 3,
    } as never);

    const { resolved, warnings } = await resolvePdf(new Uint8Array([1]));

    expect(resolved).toEqual({ kind: "text", content: "hi" });
    expect(warnings).toEqual([]);
  });

  test("large text PDF warns about page count only when warnLargePdf is set", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "hi",
      pageCount: 25,
    } as never);

    const withFlag = await resolvePdf(new Uint8Array([1]), { warnLargePdf: true });
    expect(withFlag.warnings.some((w) => w.includes("25 pages"))).toBe(true);

    const withoutFlag = await resolvePdf(new Uint8Array([1]));
    expect(withoutFlag.warnings).toEqual([]);
  });

  test("scanned PDF resolves to vision bytes with a scanned warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "file",
      bytes: new Uint8Array([9]),
      pageCount: 1,
    } as never);

    const { resolved, warnings } = await resolvePdf(new Uint8Array([1]));

    expect(resolved.kind).toBe("pdf-vision");
    expect(warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});
