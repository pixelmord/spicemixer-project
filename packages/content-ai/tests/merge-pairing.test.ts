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
const { mergePairing } = await import("../src/merge-pairing.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };
const EXISTING = {
  ingredient1: "cumin",
  ingredient2: "coriander",
  description: "Earthy and bright.",
  locale: "en",
};
const MERGED = { ingredient1: "cumin", ingredient2: "coriander", description: "Bold and citrusy." };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mergePairing — prompt source", () => {
  test("returns merged pairing with no warnings", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergePairing(
      { existing: EXISTING, source: { kind: "prompt", prompt: "Make description more vivid" } },
      MOCK_CONFIG,
    );

    expect(result.pairing.ingredient1).toBe("cumin");
    expect(result.warnings).toEqual([]);
  });

  test("includes existing pairing and prompt in AI call", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    await mergePairing(
      { existing: EXISTING, source: { kind: "prompt", prompt: "Rewrite description" } },
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string; system: string };
    expect(call.prompt).toContain("cumin");
    expect(call.prompt).toContain("Rewrite description");
    expect(call.system).toContain("RULES");
  });
});

describe("mergePairing — text source", () => {
  test("merges text content", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergePairing(
      {
        existing: EXISTING,
        source: { kind: "text", content: "Cumin and coriander are the base of many curry blends." },
      },
      MOCK_CONFIG,
    );

    expect(result.pairing).toBeDefined();
    expect(result.warnings).toEqual([]);
  });

  test("includes new text in AI prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    await mergePairing(
      { existing: EXISTING, source: { kind: "text", content: "Base of curry blends." } },
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Base of curry blends.");
  });
});

describe("mergePairing — PDF source", () => {
  test("text PDF: merges content, no warnings", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Pairing notes here",
      pageCount: 1,
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergePairing(
      { existing: EXISTING, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings).toEqual([]);
    expect(result.pairing).toBeDefined();
  });

  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "bytes",
      bytes: new Uint8Array([1]),
    } as never);
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergePairing(
      { existing: EXISTING, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("mergePairing — image source", () => {
  test("returns merged pairing from image", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: MERGED } as never);

    const result = await mergePairing(
      {
        existing: EXISTING,
        source: { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      },
      MOCK_CONFIG,
    );

    expect(result.pairing).toBeDefined();
    expect(result.warnings).toEqual([]);
    expect(generateText).toHaveBeenCalledOnce();
  });
});

describe("mergePairing — error handling", () => {
  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(generateText).mockRejectedValue(original);

    await expect(
      mergePairing({ existing: EXISTING, source: { kind: "prompt", prompt: "fix" } }, MOCK_CONFIG),
    ).rejects.toBe(original);
  });

  test("wraps non-AiError in EXTRACTION_FAILED", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("timeout"));

    try {
      await mergePairing(
        { existing: EXISTING, source: { kind: "prompt", prompt: "fix" } },
        MOCK_CONFIG,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as AiError).code).toBe("EXTRACTION_FAILED");
    }
  });
});
