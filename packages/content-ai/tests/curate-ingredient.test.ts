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

const { generateText } = await import("ai");
const { proposeIngredientPairings, proposeIngredientImprovements, proposeIngredientTranslation } =
  await import("../src/curate-ingredient.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };
const CUMIN: Parameters<typeof proposeIngredientPairings>[0] = {
  name: "Cumin",
  category: "spice",
  flavorNotes: ["earthy", "warm"],
  origin: ["India"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── proposeIngredientPairings ─────────────────────────────────────────────────

describe("proposeIngredientPairings — guards", () => {
  test("empty inventory → returns [] without calling AI", async () => {
    const result = await proposeIngredientPairings(CUMIN, [], MOCK_CONFIG);
    expect(result).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("proposeIngredientPairings — AI response", () => {
  test("returns pairings from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        pairings: [
          { slug: "coriander", description: "Classic combo", confidence: "high" },
          { slug: "turmeric", description: "Golden pair", confidence: "medium" },
        ],
      },
    } as never);

    const result = await proposeIngredientPairings(
      CUMIN,
      [
        { slug: "coriander", name: "Coriander" },
        { slug: "turmeric", name: "Turmeric" },
      ],
      MOCK_CONFIG,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      slug: "coriander",
      description: "Classic combo",
      confidence: "high",
    });
  });

  test("filters out slugs not present in inventory", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        pairings: [
          { slug: "coriander", description: "Good pair", confidence: "high" },
          { slug: "invented-slug", description: "Hallucinated", confidence: "low" },
        ],
      },
    } as never);

    const result = await proposeIngredientPairings(
      CUMIN,
      [{ slug: "coriander", name: "Coriander" }],
      MOCK_CONFIG,
    );

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("coriander");
  });

  test("normalizes confidence casing", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        pairings: [{ slug: "coriander", description: "Good pair", confidence: "HIGH" }],
      },
    } as never);

    const result = await proposeIngredientPairings(
      CUMIN,
      [{ slug: "coriander", name: "Coriander" }],
      MOCK_CONFIG,
    );

    expect(result[0].confidence).toBe("high");
  });

  test("wraps errors in AiError with EXTRACTION_FAILED", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("timeout"));

    try {
      await proposeIngredientPairings(CUMIN, [{ slug: "x", name: "X" }], MOCK_CONFIG);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as AiError).code).toBe("EXTRACTION_FAILED");
    }
  });
});

// ── proposeIngredientImprovements ─────────────────────────────────────────────

describe("proposeIngredientImprovements", () => {
  test("empty missingFields → returns { fields: [] } without calling AI", async () => {
    const result = await proposeIngredientImprovements(CUMIN, [], MOCK_CONFIG);
    expect(result).toEqual({ fields: [] });
    expect(generateText).not.toHaveBeenCalled();
  });

  test("returns improvement fields from AI", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        fields: [
          {
            field: "description",
            suggestion: "A warm earthy spice",
            rationale: "Missing description",
          },
        ],
      },
    } as never);

    const result = await proposeIngredientImprovements(CUMIN, ["description"], MOCK_CONFIG);

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].field).toBe("description");
  });

  test("passes ingredient context and missing fields to prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { fields: [] } } as never);

    await proposeIngredientImprovements(CUMIN, ["description", "family"], MOCK_CONFIG);

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Cumin");
    expect(call.prompt).toContain("description");
    expect(call.prompt).toContain("family");
  });
});

// ── proposeIngredientTranslation ──────────────────────────────────────────────

describe("proposeIngredientTranslation", () => {
  test("ingredient with no translatable fields → returns empty fields without AI", async () => {
    const result = await proposeIngredientTranslation(
      { name: "" } as never,
      "en",
      "de",
      MOCK_CONFIG,
    );
    expect(result).toEqual({ targetLocale: "de", fields: {} });
    expect(generateText).not.toHaveBeenCalled();
  });

  test("returns translated fields from AI", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { fields: { name: "Kreuzkümmel", summary: "Ein warmes Gewürz" } },
    } as never);

    const result = await proposeIngredientTranslation(
      { name: "Cumin", summary: "A warm spice" },
      "en",
      "de",
      MOCK_CONFIG,
    );

    expect(result.targetLocale).toBe("de");
    expect(result.fields["name"]).toBe("Kreuzkümmel");
  });

  test("only includes non-empty fields in prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { fields: {} } } as never);

    await proposeIngredientTranslation(
      { name: "Cumin", summary: "", description: "Earthy spice" },
      "en",
      "de",
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('"name"');
    expect(call.prompt).toContain('"description"');
    expect(call.prompt).not.toContain('"summary"');
  });
});
