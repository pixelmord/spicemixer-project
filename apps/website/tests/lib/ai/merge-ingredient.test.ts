import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { AiError } from "@pixelmord/content-ai-core";

vi.mock("@pixelmord/content-ai-ingest", () => ({
  runFill: vi.fn(),
}));

vi.mock("@/lib/image.ts", () => ({
  toImagePart: vi
    .fn()
    .mockReturnValue({ type: "image", image: new Uint8Array(), mediaType: "image/jpeg" }),
}));

vi.mock("@/lib/pdf.ts", () => ({
  extractPdfContent: vi.fn(),
}));

const { runFill } = await import("@pixelmord/content-ai-ingest");
const { extractPdfContent } = await import("@/lib/pdf.ts");
const { mergeIngredient } = await import("@/lib/ai/merge-ingredient.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const EXISTING_INGREDIENT = { name: "Cumin", category: "spice" as const };
const MERGED_INGREDIENT = { ...EXISTING_INGREDIENT, description: "Updated description" };

function makeRunFillResult(fields: Record<string, unknown>, warnings: string[] = []) {
  const suggestions = new Map(
    Object.entries(fields).map(([k, v]) => [
      k,
      {
        kind: "single" as const,
        value: v,
        confidence: "medium" as const,
        summary: k,
        hash: k,
        traceId: "t",
      },
    ]),
  );
  return {
    suggestions,
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

describe("mergeIngredient — prompt source", () => {
  test("returns merged ingredient with no warnings", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_INGREDIENT) as never);

    const result = await mergeIngredient(
      { existing: EXISTING_INGREDIENT, source: { kind: "prompt", prompt: "Add description" } },
      MOCK_CONFIG,
    );

    expect(result.ingredient.name).toBe("Cumin");
    expect(result.warnings).toEqual([]);
  });

  test("calls runFill with correct config", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_INGREDIENT) as never);

    await mergeIngredient(
      { existing: EXISTING_INGREDIENT, source: { kind: "prompt", prompt: "expand" } },
      MOCK_CONFIG,
    );

    expect(vi.mocked(runFill).mock.calls[0][0].config).toBe(MOCK_CONFIG);
  });
});

describe("mergeIngredient — text source", () => {
  test("merges text content", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_INGREDIENT) as never);

    const result = await mergeIngredient(
      { existing: EXISTING_INGREDIENT, source: { kind: "text", content: "new info" } },
      MOCK_CONFIG,
    );

    expect(result.ingredient).toBeDefined();
  });
});

describe("mergeIngredient — PDF source", () => {
  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "file",
      bytes: new Uint8Array([1]),
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_INGREDIENT) as never);

    const result = await mergeIngredient(
      { existing: EXISTING_INGREDIENT, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("mergeIngredient — error handling", () => {
  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(runFill).mockRejectedValue(original);

    await expect(
      mergeIngredient(
        { existing: EXISTING_INGREDIENT, source: { kind: "prompt", prompt: "fix" } },
        MOCK_CONFIG,
      ),
    ).rejects.toBe(original);
  });

  test("wraps non-AiError in EXTRACTION_FAILED", async () => {
    vi.mocked(runFill).mockRejectedValue(new Error("timeout"));

    await expect(
      mergeIngredient(
        { existing: EXISTING_INGREDIENT, source: { kind: "prompt", prompt: "fix" } },
        MOCK_CONFIG,
      ),
    ).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
  });
});
