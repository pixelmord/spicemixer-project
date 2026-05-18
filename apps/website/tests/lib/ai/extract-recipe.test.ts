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
const { extractRecipeFromFile } = await import("@/lib/ai/extract-recipe.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const FIXTURE_RECIPE = {
  name: "Miso Ramen",
  recipeIngredient: ["miso paste", "noodles"],
  recipeInstructions: [{ text: "Boil and serve" }],
};

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

describe("extractRecipeFromFile — text input", () => {
  test("returns recipe and empty warnings for text input", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_RECIPE) as never);

    const result = await extractRecipeFromFile(
      { kind: "text", content: "Miso Ramen recipe..." },
      MOCK_CONFIG,
    );

    expect(result.recipe.name).toBe("Miso Ramen");
    expect(result.warnings).toEqual([]);
    expect(runFill).toHaveBeenCalledOnce();
  });

  test("passes text content through runFill", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_RECIPE) as never);

    await extractRecipeFromFile({ kind: "text", content: "Special recipe text" }, MOCK_CONFIG);

    const call = vi.mocked(runFill).mock.calls[0][0];
    expect(call.config).toBe(MOCK_CONFIG);
    expect(call.sourceContext).toEqual({ kind: "text", content: "Special recipe text" });
  });

  test("wraps non-AiError in AiError with EXTRACTION_FAILED code", async () => {
    vi.mocked(runFill).mockRejectedValue(new Error("Network error"));

    await expect(
      extractRecipeFromFile({ kind: "text", content: "recipe" }, MOCK_CONFIG),
    ).rejects.toBeInstanceOf(AiError);
  });

  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(runFill).mockRejectedValue(original);

    await expect(
      extractRecipeFromFile({ kind: "text", content: "recipe" }, MOCK_CONFIG),
    ).rejects.toBe(original);
  });
});

describe("extractRecipeFromFile — PDF input", () => {
  test("text PDF: extracts and returns recipe", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Miso Ramen recipe text",
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_RECIPE) as never);

    const result = await extractRecipeFromFile(
      { kind: "pdf", bytes: new Uint8Array([1, 2, 3]) },
      MOCK_CONFIG,
    );

    expect(result.recipe.name).toBe("Miso Ramen");
    expect(result.warnings).toEqual([]);
  });

  test("large PDF: includes page count warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Recipe text",
      pageCount: 25,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_RECIPE) as never);

    const result = await extractRecipeFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("25 pages"))).toBe(true);
  });

  test("scanned PDF: includes vision model warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "file",
      bytes: new Uint8Array([1]),
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_RECIPE) as never);

    const result = await extractRecipeFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("extractRecipeFromFile — image input", () => {
  test("returns recipe from image", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_RECIPE) as never);

    const result = await extractRecipeFromFile(
      { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      MOCK_CONFIG,
    );

    expect(result.recipe.name).toBe("Miso Ramen");
    expect(result.warnings).toEqual([]);
    expect(runFill).toHaveBeenCalledOnce();
  });
});
