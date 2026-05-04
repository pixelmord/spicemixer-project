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

vi.mock("../src/image.ts", () => ({
  toImagePart: vi
    .fn()
    .mockReturnValue({ type: "image", image: new Uint8Array(), mediaType: "image/jpeg" }),
}));

vi.mock("../src/pdf.ts", () => ({
  extractPdfContent: vi.fn(),
}));

const { generateText } = await import("ai");
const { extractPdfContent } = await import("../src/pdf.ts");
const { extractRecipeFromFile } = await import("../src/extract-recipe.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const FIXTURE_RECIPE = {
  name: "Miso Ramen",
  recipeIngredient: ["miso paste", "noodles"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Boil and serve" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractRecipeFromFile — text input", () => {
  test("returns recipe and empty warnings for text input", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_RECIPE } as never);

    const result = await extractRecipeFromFile(
      { kind: "text", content: "Miso Ramen recipe..." },
      MOCK_CONFIG,
    );

    expect(result.recipe.name).toBe("Miso Ramen");
    expect(result.warnings).toEqual([]);
    expect(generateText).toHaveBeenCalledOnce();
  });

  test("passes text content to generateText prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_RECIPE } as never);

    await extractRecipeFromFile({ kind: "text", content: "Special recipe text" }, MOCK_CONFIG);

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Special recipe text");
  });

  test("wraps non-AiError in AiError with EXTRACTION_FAILED code", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("Network error"));

    try {
      await extractRecipeFromFile({ kind: "text", content: "recipe" }, MOCK_CONFIG);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AiError);
      expect((e as AiError).code).toBe("EXTRACTION_FAILED");
    }
  });

  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(generateText).mockRejectedValue(original);

    try {
      await extractRecipeFromFile({ kind: "text", content: "recipe" }, MOCK_CONFIG);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBe(original);
    }
  });
});

describe("extractRecipeFromFile — PDF input", () => {
  test("text PDF: extracts and returns recipe", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Miso Ramen recipe text",
      pageCount: 1,
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_RECIPE } as never);

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
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_RECIPE } as never);

    const result = await extractRecipeFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("25 pages"))).toBe(true);
  });

  test("scanned PDF: includes vision model warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "bytes",
      bytes: new Uint8Array([1]),
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_RECIPE } as never);

    const result = await extractRecipeFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("extractRecipeFromFile — image input", () => {
  test("returns recipe from image", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE_RECIPE } as never);

    const result = await extractRecipeFromFile(
      { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      MOCK_CONFIG,
    );

    expect(result.recipe.name).toBe("Miso Ramen");
    expect(result.warnings).toEqual([]);
    expect(generateText).toHaveBeenCalledOnce();
  });
});
