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
const { extractPairingFromFile } = await import("@/lib/ai/extract-pairing.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const FIXTURE_PAIRING = {
  ingredient1: "cumin",
  ingredient2: "coriander",
  description: "They complement each other perfectly.",
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

describe("extractPairingFromFile — text input", () => {
  test("returns pairing and empty warnings", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_PAIRING) as never);

    const result = await extractPairingFromFile(
      { kind: "text", content: "Cumin and coriander pairing..." },
      MOCK_CONFIG,
    );

    expect(result.pairing.ingredient1).toBe("cumin");
    expect(result.pairing.ingredient2).toBe("coriander");
    expect(result.warnings).toEqual([]);
  });

  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(runFill).mockRejectedValue(original);

    await expect(extractPairingFromFile({ kind: "text", content: "x" }, MOCK_CONFIG)).rejects.toBe(
      original,
    );
  });
});

describe("extractPairingFromFile — PDF input", () => {
  test("text PDF: extracts pairing", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "text",
      text: "Cumin coriander pairing",
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_PAIRING) as never);

    const result = await extractPairingFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.pairing.ingredient1).toBe("cumin");
  });

  test("scanned PDF: includes vision model warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "file",
      bytes: new Uint8Array([1]),
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_PAIRING) as never);

    const result = await extractPairingFromFile(
      { kind: "pdf", bytes: new Uint8Array([1]) },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("extractPairingFromFile — image input", () => {
  test("returns pairing from image", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(FIXTURE_PAIRING) as never);

    const result = await extractPairingFromFile(
      { kind: "image", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      MOCK_CONFIG,
    );

    expect(result.pairing.ingredient1).toBe("cumin");
    expect(runFill).toHaveBeenCalledOnce();
  });
});
