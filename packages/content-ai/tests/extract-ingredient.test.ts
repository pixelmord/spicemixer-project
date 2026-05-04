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
const { extractIngredientFromFile } = await import("../src/extract-ingredient.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };
const FIXTURE = { name: "Cumin", category: "spice", flavorNotes: ["earthy", "warm"] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractIngredientFromFile — text input", () => {
  test("returns ingredient and empty warnings", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractIngredientFromFile(
      { kind: "text", content: "Cumin is a warm earthy spice." },
      MOCK_CONFIG,
    );

    expect(result.ingredient.name).toBe("Cumin");
    expect(result.warnings).toEqual([]);
  });

  test("passes content to AI prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    await extractIngredientFromFile({ kind: "text", content: "Cumin notes here" }, MOCK_CONFIG);

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Cumin notes here");
  });

  test("wraps generic errors in EXTRACTION_FAILED", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("network error"));

    try {
      await extractIngredientFromFile({ kind: "text", content: "x" }, MOCK_CONFIG);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as AiError).code).toBe("EXTRACTION_FAILED");
    }
  });

  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(generateText).mockRejectedValue(original);

    await expect(
      extractIngredientFromFile({ kind: "text", content: "x" }, MOCK_CONFIG),
    ).rejects.toBe(original);
  });
});

describe("extractIngredientFromFile — PDF input", () => {
  test("text PDF: returns ingredient, no warnings", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Cumin spice notes",
      pageCount: 2,
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractIngredientFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.ingredient).toBeDefined();
    expect(result.warnings).toEqual([]);
  });

  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "bytes",
      bytes: new Uint8Array([1]),
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractIngredientFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("extractIngredientFromFile — image input", () => {
  test("returns ingredient from image", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractIngredientFromFile(
      { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      MOCK_CONFIG,
    );

    expect(result.ingredient.name).toBe("Cumin");
    expect(result.warnings).toEqual([]);
    expect(generateText).toHaveBeenCalledOnce();
  });
});
