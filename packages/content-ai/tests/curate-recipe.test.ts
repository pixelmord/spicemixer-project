import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { normalizeConfidence } from "../src/curate-shared.ts";

// Mock the AI SDK before importing curate-recipe
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn().mockReturnValue({}) },
}));

vi.mock("../src/provider.ts", () => ({
  createProvider: vi.fn().mockReturnValue({}),
  PROVIDER_OPTIONS: { openai: { strictJsonSchema: false } },
}));

// Import after mocks are set up
const { generateText } = await import("ai");
const {
  proposeIngredientLinks,
  proposeTags,
  proposeRecipeImprovements,
  detectLanguage,
  proposeRelations,
  proposeSlug,
  proposeRecipeTranslation,
} = await import("../src/curate-recipe.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ── normalizeConfidence ───────────────────────────────────────────────────────

describe("normalizeConfidence", () => {
  test.each([
    ["high", "high"],
    ["HIGH", "high"],
    ["High", "high"],
    ["very high", "high"],
    ["medium", "medium"],
    ["Medium", "medium"],
    ["moderate", "medium"],
    ["low", "low"],
    ["Low", "low"],
    ["unknown", "low"],
    ["", "low"],
  ])('"%s" → "%s"', (input, expected) => {
    expect(normalizeConfidence(input)).toBe(expected);
  });
});

// ── proposeIngredientLinks ────────────────────────────────────────────────────

describe("proposeIngredientLinks — guards", () => {
  test("empty ingredients → returns [] without calling AI", async () => {
    const result = await proposeIngredientLinks(
      [],
      [{ slug: "cumin", name: "Cumin" }],
      MOCK_CONFIG,
    );
    expect(result).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });

  test("empty inventory → returns [] without calling AI", async () => {
    const result = await proposeIngredientLinks(["2 tsp cumin"], [], MOCK_CONFIG);
    expect(result).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("proposeIngredientLinks — AI response", () => {
  test("returns matched links from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        links: [
          { pattern: "cumin", slug: "cumin", confidence: "high" },
          { pattern: "olive oil", slug: "olive-oil", confidence: "medium" },
        ],
      },
    } as never);

    const result = await proposeIngredientLinks(
      ["2 tsp cumin", "1 tbsp olive oil"],
      [
        { slug: "cumin", name: "Cumin" },
        { slug: "olive-oil", name: "Olive Oil" },
      ],
      MOCK_CONFIG,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ pattern: "cumin", slug: "cumin", confidence: "high" });
    expect(result[1]).toEqual({ pattern: "olive oil", slug: "olive-oil", confidence: "medium" });
  });

  test("filters out slugs not in inventory", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        links: [
          { pattern: "cumin", slug: "cumin", confidence: "high" },
          { pattern: "ghost", slug: "invented-slug", confidence: "low" },
        ],
      },
    } as never);

    const result = await proposeIngredientLinks(
      ["2 tsp cumin", "ghost pepper"],
      [{ slug: "cumin", name: "Cumin" }],
      MOCK_CONFIG,
    );

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("cumin");
  });

  test("normalizes confidence casing from AI", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { links: [{ pattern: "cumin", slug: "cumin", confidence: "High" }] },
    } as never);

    const result = await proposeIngredientLinks(
      ["cumin"],
      [{ slug: "cumin", name: "Cumin" }],
      MOCK_CONFIG,
    );

    expect(result[0].confidence).toBe("high");
  });
});

// ── proposeTags ───────────────────────────────────────────────────────────────

describe("proposeTags", () => {
  test("returns tags from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { tags: ["ramen", "miso", "japanese", "noodles"] },
    } as never);

    const result = await proposeTags(
      { name: "Miso Ramen", recipeCuisine: "Japanese" },
      [],
      MOCK_CONFIG,
    );

    expect(result.tags).toEqual(["ramen", "miso", "japanese", "noodles"]);
  });

  test("calls AI with recipe context", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { tags: [] } } as never);

    await proposeTags({ name: "Miso Ramen" }, ["existing-tag"], MOCK_CONFIG);

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Miso Ramen");
  });
});

// ── proposeRecipeImprovements ─────────────────────────────────────────────────

describe("proposeRecipeImprovements", () => {
  test("empty missingFields → returns { fields: [] } without calling AI", async () => {
    const result = await proposeRecipeImprovements({ name: "Ramen" }, [], MOCK_CONFIG);
    expect(result).toEqual({ fields: [] });
    expect(generateText).not.toHaveBeenCalled();
  });

  test("returns improvement fields from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        fields: [
          {
            field: "description",
            suggestion: "A rich miso soup",
            rationale: "Missing description",
          },
        ],
      },
    } as never);

    const result = await proposeRecipeImprovements(
      { name: "Miso Ramen" },
      ["description"],
      MOCK_CONFIG,
    );

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].field).toBe("description");
    expect(result.fields[0].suggestion).toBe("A rich miso soup");
  });
});

// ── detectLanguage ────────────────────────────────────────────────────────────

describe("detectLanguage", () => {
  test("returns language code from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { language: "de" } } as never);

    const result = await detectLanguage("Dieses Rezept ist sehr lecker.", MOCK_CONFIG);
    expect(result.language).toBe("de");
  });

  test("passes text to AI prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { language: "en" } } as never);

    await detectLanguage("This is a recipe.", MOCK_CONFIG);
    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("This is a recipe.");
  });

  test("truncates long text to 500 chars in prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { language: "en" } } as never);

    const longText = "x".repeat(1000);
    await detectLanguage(longText, MOCK_CONFIG);
    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt.length).toBeLessThan(longText.length + 200);
  });
});

// ── proposeRelations ──────────────────────────────────────────────────────────

describe("proposeRelations — guards", () => {
  test("empty existingRecipes → returns [] without calling AI", async () => {
    const result = await proposeRelations({ name: "Ramen" }, [], MOCK_CONFIG);
    expect(result).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("proposeRelations — AI response", () => {
  test("returns relations from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        relations: [
          {
            kind: "goesWellWith",
            collection: "recipes",
            slug: "gyoza",
            name: "Gyoza",
            rationale: "Classic pairing",
          },
        ],
      },
    } as never);

    const result = await proposeRelations(
      { name: "Miso Ramen" },
      [{ collection: "recipes", slug: "gyoza", name: "Gyoza" }],
      MOCK_CONFIG,
    );

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("goesWellWith");
    expect(result[0].slug).toBe("gyoza");
  });

  test("passes recipe name and candidate list to prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { relations: [] } } as never);

    await proposeRelations(
      { name: "Miso Ramen" },
      [{ collection: "recipes", slug: "gyoza", name: "Gyoza" }],
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Miso Ramen");
    expect(call.prompt).toContain("gyoza");
  });
});

// ── proposeSlug ───────────────────────────────────────────────────────────────

describe("proposeSlug", () => {
  test("returns slug from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { slug: "miso-ramen" } } as never);

    const result = await proposeSlug("Miso Ramen", "en", MOCK_CONFIG);
    expect(result.slug).toBe("miso-ramen");
  });

  test("passes name and locale to prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { slug: "miso-ramen" } } as never);

    await proposeSlug("Miso Ramen", "de", MOCK_CONFIG);
    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Miso Ramen");
    expect(call.prompt).toContain("de");
  });
});

// ── proposeRecipeTranslation ──────────────────────────────────────────────────

describe("proposeRecipeTranslation", () => {
  test("empty recipe (no translatable fields) → returns empty fields without calling AI", async () => {
    const result = await proposeRecipeTranslation({} as never, "en", "de", MOCK_CONFIG);
    expect(result).toEqual({ targetLocale: "de", fields: {} });
    expect(generateText).not.toHaveBeenCalled();
  });

  test("returns translated fields from AI output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { fields: { name: "Miso Ramen", description: "Eine reichhaltige Nudelsuppe" } },
    } as never);

    const result = await proposeRecipeTranslation(
      { name: "Miso Ramen", description: "A rich noodle soup" },
      "en",
      "de",
      MOCK_CONFIG,
    );

    expect(result.targetLocale).toBe("de");
    expect(result.fields["name"]).toBe("Miso Ramen");
    expect(result.fields["description"]).toBe("Eine reichhaltige Nudelsuppe");
  });

  test("includes only non-empty fields in prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { fields: {} } } as never);

    await proposeRecipeTranslation(
      { name: "Ramen", description: "", recipeCategory: "Main" },
      "en",
      "de",
      MOCK_CONFIG,
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('"name"');
    expect(call.prompt).toContain('"recipeCategory"');
    expect(call.prompt).not.toContain('"description"');
  });
});
