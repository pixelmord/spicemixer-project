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
const { extractIngredientFromFile } = await import("@/lib/ai/extract-ingredient.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const FIXTURE_INGREDIENT = { name: "Turmeric", category: "spice", flavorNotes: ["earthy"] };

function makeRunFillResult(fields: Record<string, unknown>) {
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
    warnings: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractIngredientFromFile — text input", () => {
  test("returns ingredient and empty warnings", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_INGREDIENT) as never);

    const result = await extractIngredientFromFile(
      { kind: "text", content: "Turmeric spice info..." },
      MOCK_CONFIG,
    );

    expect(result.ingredient.name).toBe("Turmeric");
    expect(result.warnings).toEqual([]);
    expect(runFill).toHaveBeenCalledOnce();
  });

  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(runFill).mockRejectedValue(original);

    await expect(
      extractIngredientFromFile({ kind: "text", content: "x" }, MOCK_CONFIG),
    ).rejects.toBe(original);
  });
});

describe("extractIngredientFromFile — PDF input", () => {
  test("text PDF: extracts ingredient", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Turmeric spice",
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_INGREDIENT) as never);

    const result = await extractIngredientFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.ingredient.name).toBe("Turmeric");
    expect(result.warnings).toEqual([]);
  });

  test("scanned PDF: includes vision model warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "file",
      bytes: new Uint8Array([1]),
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_INGREDIENT) as never);

    const result = await extractIngredientFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("extractIngredientFromFile — image input", () => {
  test("returns ingredient from image", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_INGREDIENT) as never);

    const result = await extractIngredientFromFile(
      { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      MOCK_CONFIG,
    );

    expect(result.ingredient.name).toBe("Turmeric");
    expect(runFill).toHaveBeenCalledOnce();
  });
});
