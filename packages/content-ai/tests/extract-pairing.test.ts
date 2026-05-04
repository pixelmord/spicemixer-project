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
const { extractPairingFromFile } = await import("../src/extract-pairing.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };
const FIXTURE = {
  ingredient1: "cumin",
  ingredient2: "coriander",
  description: "Earthy and bright.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractPairingFromFile — text input", () => {
  test("returns pairing and empty warnings", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractPairingFromFile(
      { kind: "text", content: "Cumin and coriander pair well together." },
      MOCK_CONFIG,
    );

    expect(result.pairing.ingredient1).toBe("cumin");
    expect(result.pairing.ingredient2).toBe("coriander");
    expect(result.warnings).toEqual([]);
  });

  test("passes content to AI prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    await extractPairingFromFile({ kind: "text", content: "Unique pairing text" }, MOCK_CONFIG);

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Unique pairing text");
  });

  test("wraps errors in EXTRACTION_FAILED", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("timeout"));

    try {
      await extractPairingFromFile({ kind: "text", content: "x" }, MOCK_CONFIG);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as AiError).code).toBe("EXTRACTION_FAILED");
    }
  });

  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(generateText).mockRejectedValue(original);

    await expect(extractPairingFromFile({ kind: "text", content: "x" }, MOCK_CONFIG)).rejects.toBe(
      original,
    );
  });
});

describe("extractPairingFromFile — PDF input", () => {
  test("text PDF: returns pairing, no warnings", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Cumin and coriander",
      pageCount: 1,
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractPairingFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.pairing).toBeDefined();
    expect(result.warnings).toEqual([]);
  });

  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "bytes",
      bytes: new Uint8Array([1]),
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractPairingFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("extractPairingFromFile — image input", () => {
  test("returns pairing from image", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: FIXTURE } as never);

    const result = await extractPairingFromFile(
      { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" },
      MOCK_CONFIG,
    );

    expect(result.pairing.ingredient1).toBe("cumin");
    expect(result.warnings).toEqual([]);
    expect(generateText).toHaveBeenCalledOnce();
  });
});
