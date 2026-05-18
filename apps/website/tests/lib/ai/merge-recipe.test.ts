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
const { mergeRecipe } = await import("@/lib/ai/merge-recipe.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const EXISTING_RECIPE = {
  name: "Miso Ramen",
  recipeIngredient: ["miso paste", "noodles"],
  recipeInstructions: [{ text: "Boil and serve" }],
};

const MERGED_RECIPE = { ...EXISTING_RECIPE, description: "Updated description" };

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

describe("mergeRecipe — prompt source", () => {
  test("returns merged recipe with no warnings", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_RECIPE) as never);

    const result = await mergeRecipe(
      {
        existing: EXISTING_RECIPE as never,
        source: { kind: "prompt", prompt: "Add a description" },
      },
      MOCK_CONFIG,
    );

    expect(result.recipe.name).toBe("Miso Ramen");
    expect(result.warnings).toEqual([]);
  });

  test("calls runFill with config and source context", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_RECIPE) as never);

    await mergeRecipe(
      { existing: EXISTING_RECIPE as never, source: { kind: "prompt", prompt: "Make it spicy" } },
      MOCK_CONFIG,
    );

    const call = vi.mocked(runFill).mock.calls[0][0];
    expect(call.config).toBe(MOCK_CONFIG);
    expect(call.sourceContext).toMatchObject({ source: { kind: "prompt" } });
  });
});

describe("mergeRecipe — text source", () => {
  test("merges text content into existing recipe", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_RECIPE) as never);

    const result = await mergeRecipe(
      {
        existing: EXISTING_RECIPE as never,
        source: { kind: "text", content: "Add sesame seeds to garnish." },
      },
      MOCK_CONFIG,
    );

    expect(result.recipe).toBeDefined();
    expect(result.warnings).toEqual([]);
  });
});

describe("mergeRecipe — PDF source", () => {
  test("text PDF: merges extracted text, no warnings", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "New recipe notes",
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_RECIPE) as never);

    const result = await mergeRecipe(
      { existing: EXISTING_RECIPE as never, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings).toEqual([]);
    expect(result.recipe).toBeDefined();
  });

  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "file",
      bytes: new Uint8Array([1]),
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_RECIPE) as never);

    const result = await mergeRecipe(
      { existing: EXISTING_RECIPE as never, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("mergeRecipe — image source", () => {
  test("returns merged recipe from image", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_RECIPE) as never);

    const result = await mergeRecipe(
      {
        existing: EXISTING_RECIPE as never,
        source: { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      },
      MOCK_CONFIG,
    );

    expect(result.recipe).toBeDefined();
    expect(result.warnings).toEqual([]);
    expect(runFill).toHaveBeenCalledOnce();
  });
});

describe("mergeRecipe — error handling", () => {
  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(runFill).mockRejectedValue(original);

    await expect(
      mergeRecipe(
        { existing: EXISTING_RECIPE as never, source: { kind: "prompt", prompt: "fix it" } },
        MOCK_CONFIG,
      ),
    ).rejects.toBe(original);
  });

  test("wraps non-AiError in EXTRACTION_FAILED", async () => {
    vi.mocked(runFill).mockRejectedValue(new Error("timeout"));

    await expect(
      mergeRecipe(
        { existing: EXISTING_RECIPE as never, source: { kind: "prompt", prompt: "fix it" } },
        MOCK_CONFIG,
      ),
    ).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
  });
});
