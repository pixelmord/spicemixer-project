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

vi.mock("../src/pdf.ts", () => ({ extractPdfContent: vi.fn() }));

vi.mock("../src/image.ts", () => ({
  toImagePart: vi
    .fn()
    .mockReturnValue({ type: "image", image: new Uint8Array(), mediaType: "image/jpeg" }),
}));

const { generateText } = await import("ai");
const { extractPdfContent } = await import("../src/pdf.ts");
const { mergeIngredient } = await import("../src/merge-ingredient.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };
const EXISTING = { name: "Cumin", category: "spice" as const, flavorNotes: ["earthy"] };
const MERGED = { ...EXISTING, description: "A warm, earthy ground spice." };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mergeIngredient — prompt source", () => {
  test("returns merged ingredient with no warnings", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergeIngredient(
      { existing: EXISTING, source: { kind: "prompt", prompt: "Add a description" } },
      MOCK_CONFIG,
    );

    expect(result.ingredient.name).toBe("Cumin");
    expect(result.warnings).toEqual([]);
  });

  test("passes existing ingredient JSON and user prompt to AI", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    await mergeIngredient(
      { existing: EXISTING, source: { kind: "prompt", prompt: "Add botanical name" } },
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string; system: string };
    expect(call.prompt).toContain("Cumin");
    expect(call.prompt).toContain("Add botanical name");
    expect(call.system).toContain("CRITICAL");
  });
});

describe("mergeIngredient — text source", () => {
  test("merges text into existing ingredient", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergeIngredient(
      { existing: EXISTING, source: { kind: "text", content: "Cumin is also known as jeera." } },
      MOCK_CONFIG,
    );

    expect(result.ingredient).toBeDefined();
    expect(result.warnings).toEqual([]);
  });

  test("includes new text in AI prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    await mergeIngredient(
      { existing: EXISTING, source: { kind: "text", content: "Also called jeera." } },
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Also called jeera.");
  });
});

describe("mergeIngredient — PDF source", () => {
  test("text PDF: merges content, no warnings", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Cumin profile notes",
      pageCount: 1,
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergeIngredient(
      { existing: EXISTING, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings).toEqual([]);
  });

  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "bytes",
      bytes: new Uint8Array([1]),
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergeIngredient(
      { existing: EXISTING, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("mergeIngredient — image source", () => {
  test("returns merged ingredient from image", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergeIngredient(
      {
        existing: EXISTING,
        source: { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      },
      MOCK_CONFIG,
    );

    expect(result.ingredient).toBeDefined();
    expect(result.warnings).toEqual([]);
    expect(generateText).toHaveBeenCalledOnce();
  });
});

describe("mergeIngredient — error handling", () => {
  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(generateText).mockRejectedValue(original);

    await expect(
      mergeIngredient(
        { existing: EXISTING, source: { kind: "prompt", prompt: "fix" } },
        MOCK_CONFIG,
      ),
    ).rejects.toBe(original);
  });

  test("wraps non-AiError in EXTRACTION_FAILED", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("timeout"));

    try {
      await mergeIngredient(
        { existing: EXISTING, source: { kind: "prompt", prompt: "fix" } },
        MOCK_CONFIG,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as AiError).code).toBe("EXTRACTION_FAILED");
    }
  });
});
