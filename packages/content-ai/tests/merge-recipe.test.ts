import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { AiError } from "../src/errors.ts";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn().mockReturnValue({}) },
}));

vi.mock("../src/provider.ts", () => ({
  createProvider: vi.fn().mockReturnValue({}),
  PROVIDER_OPTIONS: { openai: { strictJsonSchema: false } },
}));

vi.mock("../src/pdf.ts", () => ({
  extractPdfContent: vi.fn(),
}));

vi.mock("../src/image.ts", () => ({
  toImagePart: vi
    .fn()
    .mockReturnValue({ type: "image", image: new Uint8Array(), mediaType: "image/jpeg" }),
}));

const { generateText } = await import("ai");
const { extractPdfContent } = await import("../src/pdf.ts");
const { mergeRecipe } = await import("../src/merge-recipe.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const EXISTING_RECIPE = {
  name: "Miso Ramen",
  recipeIngredient: ["miso paste", "noodles"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Boil and serve" }],
};

const MERGED_RECIPE = {
  ...EXISTING_RECIPE,
  description: "Updated description",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── prompt source ─────────────────────────────────────────────────────────────

describe("mergeRecipe — prompt source", () => {
  test("returns merged recipe with no warnings", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED_RECIPE } as never);

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

  test("passes existing recipe JSON and user prompt to AI", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED_RECIPE } as never);

    await mergeRecipe(
      { existing: EXISTING_RECIPE as never, source: { kind: "prompt", prompt: "Make it spicy" } },
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string; system: string };
    expect(call.prompt).toContain("Miso Ramen");
    expect(call.prompt).toContain("Make it spicy");
    expect(call.system).toContain("CRITICAL");
  });
});

// ── text source ───────────────────────────────────────────────────────────────

describe("mergeRecipe — text source", () => {
  test("merges text content into existing recipe", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED_RECIPE } as never);

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

  test("includes new text content in AI prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED_RECIPE } as never);

    await mergeRecipe(
      {
        existing: EXISTING_RECIPE as never,
        source: { kind: "text", content: "Add sesame seeds." },
      },
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Add sesame seeds.");
  });
});

// ── PDF source ────────────────────────────────────────────────────────────────

describe("mergeRecipe — PDF source", () => {
  test("text PDF: merges extracted text, no warnings", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "New recipe notes",
      pageCount: 1,
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: MERGED_RECIPE } as never);

    const result = await mergeRecipe(
      { existing: EXISTING_RECIPE as never, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings).toEqual([]);
    expect(result.recipe).toBeDefined();
  });

  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "bytes",
      bytes: new Uint8Array([1]),
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: MERGED_RECIPE } as never);

    const result = await mergeRecipe(
      { existing: EXISTING_RECIPE as never, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe("mergeRecipe — image source", () => {
  test("returns merged recipe from image", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED_RECIPE } as never);

    const result = await mergeRecipe(
      {
        existing: EXISTING_RECIPE as never,
        source: { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      },
      MOCK_CONFIG,
    );

    expect(result.recipe).toBeDefined();
    expect(result.warnings).toEqual([]);
    expect(generateText).toHaveBeenCalledOnce();
  });
});

describe("mergeRecipe — error handling", () => {
  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(generateText).mockRejectedValue(original);

    try {
      await mergeRecipe(
        { existing: EXISTING_RECIPE as never, source: { kind: "prompt", prompt: "fix it" } },
        MOCK_CONFIG,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBe(original);
    }
  });

  test("wraps non-AiError in EXTRACTION_FAILED", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("timeout"));

    try {
      await mergeRecipe(
        { existing: EXISTING_RECIPE as never, source: { kind: "prompt", prompt: "fix it" } },
        MOCK_CONFIG,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as AiError).code).toBe("EXTRACTION_FAILED");
    }
  });
});
