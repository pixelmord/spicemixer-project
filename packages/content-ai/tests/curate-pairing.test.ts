import { describe, expect, test, vi, beforeEach } from "vite-plus/test";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn().mockReturnValue({}) },
}));

vi.mock("../src/provider.ts", () => ({
  createProvider: vi.fn().mockReturnValue({}),
  PROVIDER_OPTIONS: { openai: { strictJsonSchema: false } },
}));

const { generateText } = await import("ai");
const { proposePairingImprovements, proposePairingTranslation } =
  await import("../src/curate-pairing.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ── proposePairingImprovements ────────────────────────────────────────────────

describe("proposePairingImprovements — guards", () => {
  test("missing ingredient1 → returns { fields: [] } without calling AI", async () => {
    const result = await proposePairingImprovements(
      { ingredient1: "", ingredient2: "coriander" },
      "en",
      MOCK_CONFIG,
    );
    expect(result).toEqual({ fields: [] });
    expect(generateText).not.toHaveBeenCalled();
  });

  test("missing ingredient2 → returns { fields: [] } without calling AI", async () => {
    const result = await proposePairingImprovements(
      { ingredient1: "cumin", ingredient2: "" },
      "en",
      MOCK_CONFIG,
    );
    expect(result).toEqual({ fields: [] });
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("proposePairingImprovements — AI response", () => {
  test("always sets field to 'description' regardless of AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        fields: [
          {
            field: "whatever",
            suggestion: "Earthy and citrusy pair well.",
            rationale: "Flavor harmony",
          },
        ],
      },
    } as never);

    const result = await proposePairingImprovements(
      { ingredient1: "cumin", ingredient2: "coriander" },
      "en",
      MOCK_CONFIG,
    );

    expect(result.fields[0].field).toBe("description");
    expect(result.fields[0].suggestion).toBe("Earthy and citrusy pair well.");
  });

  test("passes both ingredient names and locale to prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { fields: [] } } as never);

    await proposePairingImprovements(
      { ingredient1: "cumin", ingredient2: "coriander", description: "Earthy combo" },
      "de",
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("cumin");
    expect(call.prompt).toContain("coriander");
    expect(call.prompt).toContain("de");
  });

  test("includes current description context when present", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { fields: [] } } as never);

    await proposePairingImprovements(
      { ingredient1: "cumin", ingredient2: "coriander", description: "Earthy combo" },
      "en",
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Earthy combo");
  });

  test("includes rejectedContext in prompt when provided", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { fields: [] } } as never);

    await proposePairingImprovements(
      { ingredient1: "cumin", ingredient2: "coriander" },
      "en",
      MOCK_CONFIG,
      "Previously rejected: too vague",
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Previously rejected");
  });
});

// ── proposePairingTranslation ─────────────────────────────────────────────────

describe("proposePairingTranslation", () => {
  test("no description → returns empty fields without calling AI", async () => {
    const result = await proposePairingTranslation(
      { ingredient1: "cumin", ingredient2: "coriander" },
      "en",
      "de",
      MOCK_CONFIG,
    );
    expect(result).toEqual({ targetLocale: "de", fields: {} });
    expect(generateText).not.toHaveBeenCalled();
  });

  test("returns translated description from AI", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { fields: { description: "Kümmel und Koriander ergänzen sich hervorragend." } },
    } as never);

    const result = await proposePairingTranslation(
      {
        ingredient1: "cumin",
        ingredient2: "coriander",
        description: "Earthy and bright together.",
      },
      "en",
      "de",
      MOCK_CONFIG,
    );

    expect(result.targetLocale).toBe("de");
    expect(result.fields["description"]).toContain("Kümmel");
  });

  test("passes source description and locale pair to prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { fields: {} } } as never);

    await proposePairingTranslation(
      { ingredient1: "cumin", ingredient2: "coriander", description: "Earthy together." },
      "en",
      "de",
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("en");
    expect(call.prompt).toContain("de");
    expect(call.prompt).toContain("Earthy together.");
  });
});
