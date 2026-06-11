import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { AiError } from "@pixelmord/content-ai-core";

vi.mock("ai", () => ({
  streamObject: vi.fn(),
}));

vi.mock("@/lib/ai/provider.ts", () => ({
  createProvider: vi.fn().mockReturnValue({}),
  PROVIDER_OPTIONS: { openai: { strictJsonSchema: false } },
}));

vi.mock("@pixelmord/content-ai-core/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pixelmord/content-ai-core/server")>();
  return {
    ...actual,
    getCurrentOrigin: vi.fn().mockReturnValue(null),
  };
});

vi.mock("@/lib/pubsub.ts", () => ({
  publish: vi.fn(),
}));

const { streamObject } = await import("ai");
const { getCurrentOrigin } = await import("@pixelmord/content-ai-core/server");
const { publish } = await import("@/lib/pubsub.ts");
const { generateRecipeFromPrompt } = await import("@/lib/ai/generate-recipe.ts");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "test" };

const FIXTURE_RECIPE = {
  name: "Thai Curry",
  recipeIngredient: ["coconut milk", "curry paste"],
  recipeInstructions: [{ text: "Mix and cook" }],
};

function makeStreamMock(finalRecipe: Record<string, unknown>, partials: unknown[] = []) {
  const partialStream = (async function* () {
    for (const p of partials) yield p;
  })();
  return {
    partialObjectStream: partialStream,
    object: Promise.resolve(finalRecipe),
    finishReason: Promise.resolve("stop"),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 50 }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateRecipeFromPrompt", () => {
  test("returns recipe and empty warnings", async () => {
    vi.mocked(streamObject).mockReturnValue(makeStreamMock(FIXTURE_RECIPE) as never);

    const result = await generateRecipeFromPrompt({ prompt: "make a Thai curry" }, MOCK_CONFIG);

    expect(result.recipe.name).toBe("Thai Curry");
    expect(result.warnings).toEqual([]);
  });

  test("publishes partials when origin is set", async () => {
    vi.mocked(getCurrentOrigin).mockReturnValue({
      runId: "run-1",
      traceId: "t",
      model: "test",
    } as never);
    vi.mocked(streamObject).mockReturnValue(
      makeStreamMock(FIXTURE_RECIPE, [{ name: "Thai" }, { name: "Thai Curry" }]) as never,
    );

    await generateRecipeFromPrompt({ prompt: "make a Thai curry" }, MOCK_CONFIG);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(vi.mocked(publish).mock.calls[0][0]).toBe("run-1");
  });

  test("does not publish when no origin", async () => {
    vi.mocked(getCurrentOrigin).mockReturnValue(undefined);
    vi.mocked(streamObject).mockReturnValue(makeStreamMock(FIXTURE_RECIPE) as never);

    await generateRecipeFromPrompt({ prompt: "make curry" }, MOCK_CONFIG);

    expect(publish).not.toHaveBeenCalled();
  });

  test("includes debug info when debug option is set", async () => {
    vi.mocked(streamObject).mockReturnValue(makeStreamMock(FIXTURE_RECIPE) as never);

    const result = await generateRecipeFromPrompt({ prompt: "curry" }, MOCK_CONFIG, {
      debug: true,
    });

    expect(result.debug).toBeDefined();
  });

  test("uses German locale hint when locale=de", async () => {
    vi.mocked(streamObject).mockReturnValue(makeStreamMock(FIXTURE_RECIPE) as never);

    await generateRecipeFromPrompt({ prompt: "curry", locale: "de" }, MOCK_CONFIG);

    const call = vi.mocked(streamObject).mock.calls[0][0] as { system: string };
    expect(call.system).toContain("German");
  });

  test("wraps errors in AiError", async () => {
    vi.mocked(streamObject).mockReturnValue({
      partialObjectStream: (async function* () {})(),
      object: Promise.reject(new Error("overloaded")),
      finishReason: Promise.resolve("error"),
      usage: Promise.resolve({}),
    } as never);

    await expect(generateRecipeFromPrompt({ prompt: "curry" }, MOCK_CONFIG)).rejects.toBeInstanceOf(
      AiError,
    );
  });
});
