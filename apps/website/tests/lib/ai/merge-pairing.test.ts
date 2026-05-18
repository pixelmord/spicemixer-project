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
const { mergePairing } = await import("@/lib/ai/merge-pairing.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const EXISTING_PAIRING = {
  ingredient1: "cumin",
  ingredient2: "coriander",
  description: "They pair well.",
  locale: "en",
};

const MERGED_PAIRING = {
  ingredient1: "cumin",
  ingredient2: "coriander",
  description: "Updated description.",
};

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

describe("mergePairing — prompt source", () => {
  test("returns merged pairing with no warnings", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_PAIRING) as never);

    const result = await mergePairing(
      { existing: EXISTING_PAIRING, source: { kind: "prompt", prompt: "Update the description" } },
      MOCK_CONFIG,
    );

    expect(result.pairing.ingredient1).toBe("cumin");
    expect(result.warnings).toEqual([]);
  });

  test("calls runFill with correct config", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_PAIRING) as never);

    await mergePairing(
      { existing: EXISTING_PAIRING, source: { kind: "prompt", prompt: "expand" } },
      MOCK_CONFIG,
    );

    expect(vi.mocked(runFill).mock.calls[0][0].config).toBe(MOCK_CONFIG);
  });
});

describe("mergePairing — text source", () => {
  test("merges text content", async () => {
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_PAIRING) as never);

    const result = await mergePairing(
      { existing: EXISTING_PAIRING, source: { kind: "text", content: "new info" } },
      MOCK_CONFIG,
    );

    expect(result.pairing).toBeDefined();
  });
});

describe("mergePairing — PDF source", () => {
  test("scanned PDF: adds vision warning", async () => {
    vi.mocked(extractPdfContent).mockResolvedValue({
      kind: "file",
      bytes: new Uint8Array([1]),
      pageCount: 1,
    } as never);
    vi.mocked(runFill).mockResolvedValue(makeRunFillResult(MERGED_PAIRING) as never);

    const result = await mergePairing(
      { existing: EXISTING_PAIRING, source: { kind: "pdf", bytes: new Uint8Array([1]) } },
      MOCK_CONFIG,
    );

    expect(result.warnings.some((w) => w.includes("scanned"))).toBe(true);
  });
});

describe("mergePairing — error handling", () => {
  test("re-throws AiError as-is", async () => {
    const original = new AiError("NOT_CONFIGURED", "no key");
    vi.mocked(runFill).mockRejectedValue(original);

    await expect(
      mergePairing(
        { existing: EXISTING_PAIRING, source: { kind: "prompt", prompt: "fix" } },
        MOCK_CONFIG,
      ),
    ).rejects.toBe(original);
  });

  test("wraps non-AiError in EXTRACTION_FAILED", async () => {
    vi.mocked(runFill).mockRejectedValue(new Error("timeout"));

    await expect(
      mergePairing(
        { existing: EXISTING_PAIRING, source: { kind: "prompt", prompt: "fix" } },
        MOCK_CONFIG,
      ),
    ).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
  });
});
