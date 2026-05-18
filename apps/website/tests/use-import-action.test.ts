import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { SourceShape } from "../src/components/admin/FileTextPromptSourcePicker.tsx";

// Mock astro:actions to avoid Astro-specific runtime
vi.mock("astro:actions", () => ({
  actions: {
    aiExtractRecipe: vi.fn(),
    aiExtractIngredient: vi.fn(),
    aiExtractPairing: vi.fn(),
  },
}));

// Mock readSSE to avoid streaming in unit tests
vi.mock("../src/lib/sse.ts", () => ({
  readSSE: vi.fn(),
}));

import { actions } from "astro:actions";
import { readSSE } from "../src/lib/sse.ts";
import {
  buildFormData,
  generateRecipe,
  extractContent,
  useImportAction,
  parseActionError,
} from "../src/lib/ai/use-import-action.ts";

const mockActions = actions as {
  aiExtractRecipe: ReturnType<typeof vi.fn>;
  aiExtractIngredient: ReturnType<typeof vi.fn>;
  aiExtractPairing: ReturnType<typeof vi.fn>;
};

const mockReadSSE = readSSE as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── buildFormData ─────────────────────────────────────────────────────────────

describe("buildFormData", () => {
  test("appends file and mimeType for file source", () => {
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const source: SourceShape = { kind: "file", file, mimeType: "application/pdf" };
    const fd = buildFormData(source);
    expect(fd.get("file")).toBe(file);
    expect(fd.get("mimeType")).toBe("application/pdf");
    expect(fd.get("text")).toBeNull();
  });

  test("appends text for text source", () => {
    const source: SourceShape = { kind: "text", content: "hello world" };
    const fd = buildFormData(source);
    expect(fd.get("text")).toBe("hello world");
    expect(fd.get("file")).toBeNull();
  });

  test("appends prompt text for prompt source", () => {
    const source: SourceShape = { kind: "prompt", prompt: "make a curry" };
    const fd = buildFormData(source);
    expect(fd.get("text")).toBe("make a curry");
  });

  test("appends debug flag when debug=true", () => {
    const source: SourceShape = { kind: "text", content: "x" };
    const fd = buildFormData(source, true);
    expect(fd.get("debug")).toBe("1");
  });

  test("omits debug flag when debug=false", () => {
    const source: SourceShape = { kind: "text", content: "x" };
    const fd = buildFormData(source, false);
    expect(fd.get("debug")).toBeNull();
  });
});

// ── parseActionError ──────────────────────────────────────────────────────────

describe("parseActionError", () => {
  test("returns plain message when no sentinel present", () => {
    const result = parseActionError("Something went wrong");
    expect(result.message).toBe("Something went wrong");
    expect(result.details).toBeUndefined();
  });

  test("parses structured details after sentinel", () => {
    const details = { modelId: "gpt-4o", finishReason: "length" };
    const msg = `Extraction failed__AI_DETAILS__${JSON.stringify(details)}`;
    const result = parseActionError(msg);
    expect(result.message).toBe("Extraction failed");
    expect(result.details?.modelId).toBe("gpt-4o");
  });

  test("returns full message on invalid JSON after sentinel", () => {
    const msg = "Oops__AI_DETAILS__not-valid-json";
    const result = parseActionError(msg);
    expect(result.message).toBe(msg);
    expect(result.details).toBeUndefined();
  });
});

// ── extractContent — non-streaming dispatch ───────────────────────────────────

describe("extractContent", () => {
  const textSource: SourceShape = { kind: "text", content: "some recipe text" };

  test("dispatches to aiExtractRecipe for recipe contentType", async () => {
    mockActions.aiExtractRecipe.mockResolvedValue({
      data: { recipe: { name: "Curry" }, warnings: [] },
      error: null,
    });

    const result = await extractContent("recipe", textSource, false);
    expect(mockActions.aiExtractRecipe).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ name: "Curry" });
    expect(result.successMessage).toBe("Recipe extracted!");
  });

  test("dispatches to aiExtractIngredient for ingredient contentType", async () => {
    mockActions.aiExtractIngredient.mockResolvedValue({
      data: { ingredient: { name: "Turmeric" }, warnings: ["missing image"] },
      error: null,
    });

    const result = await extractContent("ingredient", textSource, false);
    expect(mockActions.aiExtractIngredient).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ name: "Turmeric" });
    expect(result.warnings).toEqual(["missing image"]);
    expect(result.successMessage).toBe("Ingredient extracted!");
  });

  test("dispatches to aiExtractPairing for pairing contentType", async () => {
    mockActions.aiExtractPairing.mockResolvedValue({
      data: { pairing: { ingredient1: "Cumin", ingredient2: "Coriander" }, warnings: [] },
      error: null,
    });

    const result = await extractContent("pairing", textSource, false);
    expect(mockActions.aiExtractPairing).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ ingredient1: "Cumin", ingredient2: "Coriander" });
    expect(result.successMessage).toBe("Pairing extracted!");
  });

  test("throws on action error", async () => {
    mockActions.aiExtractRecipe.mockResolvedValue({
      data: null,
      error: { message: "AI failed" },
    });

    await expect(extractContent("recipe", textSource, false)).rejects.toThrow("AI failed");
  });
});

// ── generateRecipe — SSE streaming dispatch ───────────────────────────────────

describe("generateRecipe", () => {
  function makeSseStream(events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const ev of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
        controller.close();
      },
    });
  }

  test("invokes SSE endpoint with correct payload", async () => {
    const stream = makeSseStream([
      { type: "complete", result: { recipe: { name: "Thai Curry" }, warnings: [] } },
    ]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: stream, statusText: "OK" });
    mockReadSSE.mockImplementation(async function* (body: ReadableStream) {
      yield { type: "complete", result: { recipe: { name: "Thai Curry" }, warnings: [] } };
    });

    const result = await generateRecipe("make a Thai curry", "en", "recipes");
    expect(fetch).toHaveBeenCalledWith(
      "/api/ai/generate-recipe/stream",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Thai curry"),
      }),
    );
    expect(result.result).toEqual({ name: "Thai Curry" });
    expect(result.successMessage).toBe("Recipe generated!");
  });

  test("fires onPartial for each partial event before completion", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: {}, statusText: "OK" });
    const partials: Record<string, unknown>[] = [];
    mockReadSSE.mockImplementation(async function* () {
      yield { type: "partial", recipe: { name: "Thai" } };
      yield { type: "partial", recipe: { name: "Thai Curry" } };
      yield { type: "complete", result: { recipe: { name: "Thai Curry" }, warnings: [] } };
    });

    await generateRecipe("make a Thai curry", "en", "recipes", (p) => partials.push(p));

    expect(partials).toHaveLength(2);
    expect(partials[0]).toEqual({ name: "Thai" });
    expect(partials[1]).toEqual({ name: "Thai Curry" });
  });

  test("throws on SSE error event", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: {}, statusText: "OK" });
    mockReadSSE.mockImplementation(async function* () {
      yield { type: "error", message: "Model overloaded" };
    });

    await expect(generateRecipe("curry", "en", "recipes")).rejects.toThrow("Model overloaded");
  });

  test("throws when stream ends without complete event", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: {}, statusText: "OK" });
    mockReadSSE.mockImplementation(async function* () {
      // no events
    });

    await expect(generateRecipe("curry", "en", "recipes")).rejects.toThrow(
      "Stream ended without a complete event",
    );
  });

  test("throws when fetch response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, body: null, statusText: "Bad Gateway" });

    await expect(generateRecipe("curry", "en", "recipes")).rejects.toThrow(
      "Generation failed: Bad Gateway",
    );
  });

  test("uses mixture style for mixtures collection", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: {}, statusText: "OK" });
    mockReadSSE.mockImplementation(async function* () {
      yield { type: "complete", result: { recipe: { name: "Berbere" }, warnings: [] } };
    });

    await generateRecipe("berbere spice blend", "en", "mixtures");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.style).toBe("mixture");
  });
});

// ── useImportAction — dispatch integration ────────────────────────────────────

describe("useImportAction", () => {
  test("routes recipe+prompt source to SSE generate path", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: {}, statusText: "OK" });
    mockReadSSE.mockImplementation(async function* () {
      yield { type: "complete", result: { recipe: { name: "Curry" }, warnings: [] } };
    });

    const handler = useImportAction("recipe", "en", "recipes");
    const source: SourceShape = { kind: "prompt", prompt: "make curry" };
    const result = await handler(source);

    expect(fetch).toHaveBeenCalledWith("/api/ai/generate-recipe/stream", expect.anything());
    expect(result.successMessage).toBe("Recipe generated!");
  });

  test("routes recipe+file source to non-streaming extract", async () => {
    mockActions.aiExtractRecipe.mockResolvedValue({
      data: { recipe: { name: "Pasta" }, warnings: [] },
      error: null,
    });

    const handler = useImportAction("recipe", "en", "recipes");
    const file = new File([""], "pasta.pdf", { type: "application/pdf" });
    const source: SourceShape = { kind: "file", file, mimeType: "application/pdf" };
    const result = await handler(source);

    expect(mockActions.aiExtractRecipe).toHaveBeenCalledOnce();
    expect(result.successMessage).toBe("Recipe extracted!");
  });

  test("routes ingredient source to aiExtractIngredient", async () => {
    mockActions.aiExtractIngredient.mockResolvedValue({
      data: { ingredient: { name: "Saffron" }, warnings: [] },
      error: null,
    });

    const handler = useImportAction("ingredient", "en");
    const source: SourceShape = { kind: "text", content: "saffron spice" };
    const result = await handler(source);

    expect(mockActions.aiExtractIngredient).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ name: "Saffron" });
  });

  test("routes pairing source to aiExtractPairing", async () => {
    mockActions.aiExtractPairing.mockResolvedValue({
      data: { pairing: { ingredient1: "A", ingredient2: "B" }, warnings: [] },
      error: null,
    });

    const handler = useImportAction("pairing", "de");
    const source: SourceShape = { kind: "text", content: "pairing text" };
    const result = await handler(source);

    expect(mockActions.aiExtractPairing).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ ingredient1: "A", ingredient2: "B" });
  });

  test("passes onPartial to SSE streaming path", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: {}, statusText: "OK" });
    const partials: Record<string, unknown>[] = [];
    mockReadSSE.mockImplementation(async function* () {
      yield { type: "partial", recipe: { name: "Draft" } };
      yield { type: "complete", result: { recipe: { name: "Final" }, warnings: [] } };
    });

    const handler = useImportAction("recipe", "en", "recipes", (p) => partials.push(p));
    const source: SourceShape = { kind: "prompt", prompt: "make something" };
    await handler(source);

    expect(partials).toHaveLength(1);
    expect(partials[0]).toEqual({ name: "Draft" });
  });
});
