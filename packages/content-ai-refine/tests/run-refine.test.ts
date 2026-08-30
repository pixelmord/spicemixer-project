import { describe, expect, test, vi, beforeEach } from "vite-plus/test";
import { z } from "zod";

// Mock ai SDK before importing run-refine
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn().mockReturnValue({}) },
}));

vi.mock("@pixelmord/content-ai-core/server", () => ({
  createProvider: vi.fn().mockReturnValue({}),
  PROVIDER_OPTIONS: { openai: { strictJsonSchema: false } },
}));

const { generateText, Output } = await import("ai");
const { runRefine } = await import("../src/run-refine.ts");
const { createProvider } = await import("@pixelmord/content-ai-core/server");

const MOCK_CONFIG = { baseUrl: "http://localhost", apiKey: "test", model: "gpt-4o-mini" };

const testSchema = z.object({
  name: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const baseContract = {
  schema: testSchema,
  presets: [],
  fields: {
    summary: {
      systemPrompt: () => "Write a summary for this entity.",
      autoApply: { policy: "never" as const },
    },
    description: {
      systemPrompt: () => "Write a description for this entity.",
      autoApply: { policy: "never" as const },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Dispatch by target ────────────────────────────────────────────────────────

describe("dispatch by target", () => {
  test("processes only the specified target field", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A short summary" } } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    expect(suggestions.size).toBe(1);
    expect(suggestions.has("summary")).toBe(true);
    expect(suggestions.has("description")).toBe(false);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  test("processes multiple target fields from array", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "result" } } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: ["summary", "description"],
      config: MOCK_CONFIG,
    });

    expect(suggestions.size).toBe(2);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  test("processes all fields with systemPrompt when no target specified", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "result" } } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      config: MOCK_CONFIG,
    });

    expect(suggestions.size).toBe(2);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  test("skips fields whose systemPrompt resolves to an empty string", async () => {
    const contractWithGatedField = {
      ...baseContract,
      fields: {
        ...baseContract.fields,
        // Precondition unmet → prompt returns "" → must be skipped (no LLM call).
        tags: {
          systemPrompt: () => "",
          autoApply: { policy: "never" as const },
        },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "result" } } as never);

    const { suggestions } = await runRefine({
      contract: contractWithGatedField,
      currentData: { name: "Cumin" },
      target: ["summary", "tags"],
      config: MOCK_CONFIG,
    });

    // 'summary' runs; 'tags' is gated by an empty prompt and never hits the model.
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(suggestions.has("tags")).toBe(false);
    expect(suggestions.has("summary")).toBe(true);
  });

  test("skips fields without systemPrompt", async () => {
    const contractWithTranslationOnly = {
      ...baseContract,
      fields: {
        ...baseContract.fields,
        name: { translation: { mode: "translate" as const } },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "result" } } as never);

    await runRefine({
      contract: contractWithTranslationOnly,
      currentData: { name: "Cumin" },
      target: ["name", "summary"],
      config: MOCK_CONFIG,
    });

    // Only 'summary' has systemPrompt; 'name' has no systemPrompt
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});

// ── Write-policy application ──────────────────────────────────────────────────

describe("write-policy application", () => {
  test("preserve policy: skips LLM when field has a value", async () => {
    const contract = {
      ...baseContract,
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          autoApply: { policy: "never" as const },
          writePolicy: "preserve" as const,
        },
      },
    };

    await runRefine({
      contract,
      currentData: { name: "Cumin", summary: "Existing summary" },
      config: MOCK_CONFIG,
    });

    expect(generateText).not.toHaveBeenCalled();
  });

  test("preserve policy: calls LLM when field is empty", async () => {
    const contract = {
      ...baseContract,
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          autoApply: { policy: "never" as const },
          writePolicy: "preserve" as const,
        },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    await runRefine({
      contract,
      currentData: { name: "Cumin" },
      config: MOCK_CONFIG,
    });

    expect(generateText).toHaveBeenCalledTimes(1);
  });

  test("fill-if-empty policy: skips LLM when field has a value", async () => {
    const contract = {
      ...baseContract,
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          autoApply: { policy: "never" as const },
          writePolicy: "fill-if-empty" as const,
        },
      },
    };

    await runRefine({
      contract,
      currentData: { name: "Cumin", summary: "Existing summary" },
      config: MOCK_CONFIG,
    });

    expect(generateText).not.toHaveBeenCalled();
  });

  test("replace policy (default): always calls LLM even when field has value", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "New summary" } } as never);

    await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin", summary: "Existing summary" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    expect(generateText).toHaveBeenCalledTimes(1);
  });
});

// ── Suggestion shape ──────────────────────────────────────────────────────────

describe("suggestion shape", () => {
  test("returns FieldSuggestion with kind:single for each processed field", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A short summary" } } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    const suggestion = suggestions.get("summary");
    expect(suggestion).toBeDefined();
    expect(suggestion?.kind).toBe("single");
    if (suggestion?.kind === "single") {
      expect(suggestion.value).toBe("A short summary");
      expect(suggestion.traceId).toBeTruthy();
      expect(suggestion.hash).toBeTruthy();
      expect(suggestion.summary).toBeTruthy();
    }
  });

  test("returns TraceSummary in traces map", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    const { traces } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    expect(traces.size).toBe(1);
    const [traceSummary] = traces.values();
    expect(traceSummary.model).toBe(MOCK_CONFIG.model);
    expect(typeof traceSummary.runtimeMs).toBe("number");
  });

  test("null LLM output produces no suggestion for that field", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: null } } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    expect(suggestions.size).toBe(0);
  });
});

// ── Confidence source ─────────────────────────────────────────────────────────

describe("confidence source", () => {
  test("reads the model's self-reported confidence into the suggestion", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { value: "A summary", confidence: "high" },
    } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    const suggestion = suggestions.get("summary");
    expect(suggestion?.kind).toBe("single");
    if (suggestion?.kind === "single") {
      expect(suggestion.confidence).toBe("high");
    }
  });

  test("falls back to medium when the model omits confidence", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    const suggestion = suggestions.get("summary");
    if (suggestion?.kind === "single") {
      expect(suggestion.confidence).toBe("medium");
    }
  });
});

// ── OpenAI strict-schema compatibility ───────────────────────────────────────

describe("OpenAI strict-schema compatibility", () => {
  // The wrapped schema is sent to OpenAI's Responses API with
  // strictJsonSchema: true. Strict mode rejects any JSON Schema whose object
  // `required` array does not include every key in `properties`. The AI SDK
  // converts zod schemas with io: "input", where `.optional()` and
  // `.default()` both leave the key out of `required` — so the wrapper must
  // not use them. Regression test for the 400 "Missing 'confidence'" error.
  function toJsonSchemaLikeAiSdk(schema: z.ZodType): Record<string, unknown> {
    return z.toJSONSchema(schema, { target: "draft-7", io: "input", reused: "inline" });
  }

  function assertStrictCompatible(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((child, i) => assertStrictCompatible(child, `${path}[${i}]`));
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const schema = node as Record<string, unknown>;
    const type = schema["type"];
    if (type === "object" || (Array.isArray(type) && type.includes("object"))) {
      const props = Object.keys((schema["properties"] ?? {}) as Record<string, unknown>);
      expect(
        schema["required"],
        `${path}: strict mode requires a 'required' array listing every property`,
      ).toBeInstanceOf(Array);
      for (const key of props) {
        expect(
          schema["required"],
          `${path}: property '${key}' missing from 'required' (OpenAI strict mode 400)`,
        ).toContain(key);
      }
    }
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties") {
        for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
          assertStrictCompatible(propValue, `${path}.${propKey}`);
        }
      } else if (["items", "anyOf", "allOf", "oneOf", "definitions", "$defs"].includes(key)) {
        assertStrictCompatible(value, `${path}.${key}`);
      }
    }
  }

  test("wrapped schema puts every property (incl. confidence) in required", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { value: "A summary", confidence: "high" },
    } as never);

    const pairingsField = {
      systemPrompt: () => "Propose pairings.",
      autoApply: { policy: "never" as const },
      outputSchema: z.array(
        z.object({
          otherCollection: z.enum(["ingredients", "mixtures", "recipes"]),
          otherSlug: z.string(),
          rationale: z.string(),
          confidence: z.enum(["high", "medium", "low"]),
        }),
      ),
    };

    await runRefine({
      contract: {
        ...baseContract,
        fields: { ...baseContract.fields, pairings: pairingsField },
      },
      currentData: { name: "Cumin" },
      target: ["summary", "pairings"],
      config: MOCK_CONFIG,
    });

    const calls = vi.mocked(Output.object).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const wrappedSchemas = calls.slice(-2).map(([arg]) => arg?.schema);
    for (const [index, wrappedSchema] of wrappedSchemas.entries()) {
      expect(wrappedSchema).toBeDefined();
      const wireSchema = toJsonSchemaLikeAiSdk(wrappedSchema as z.ZodType);
      expect(wireSchema).toMatchObject({
        properties: { value: expect.anything(), confidence: expect.anything() },
      });
      assertStrictCompatible(wireSchema, `$[call ${index}]`);
    }
  });
});

// ── Pre-mutation ──────────────────────────────────────────────────────────────

describe("pre-mutation", () => {
  test("auto-applied fields are NOT in suggestions but are in autoApplied", async () => {
    const contract = {
      ...baseContract,
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          // Threshold 0.0 auto-applies medium confidence (score 0.5 >= 0.0)
          autoApply: { policy: "high-confidence" as const, threshold: 0.0 },
        },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "Auto summary" } } as never);

    const { suggestions, autoApplied } = await runRefine({
      contract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    expect(suggestions.has("summary")).toBe(false);
    expect(autoApplied.has("summary")).toBe(true);
    const applied = autoApplied.get("summary");
    expect(applied?.value).toBe("Auto summary");
  });

  test("high-confidence threshold 0.85 does NOT auto-apply medium-confidence suggestion", async () => {
    const contract = {
      ...baseContract,
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          autoApply: { policy: "high-confidence" as const, threshold: 0.85 },
        },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    const { suggestions, autoApplied } = await runRefine({
      contract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    expect(suggestions.has("summary")).toBe(true);
    expect(autoApplied.has("summary")).toBe(false);
  });

  test("fields not processed remain unchanged in non-returned data", async () => {
    const contract = {
      ...baseContract,
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          autoApply: { policy: "high-confidence" as const, threshold: 0.0 },
        },
        description: {
          systemPrompt: () => "Write a description.",
          autoApply: { policy: "never" as const },
        },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "Applied value" } } as never);

    const { autoApplied, suggestions } = await runRefine({
      contract,
      currentData: { name: "Cumin", description: "Existing desc" },
      target: ["summary", "description"],
      config: MOCK_CONFIG,
    });

    expect(autoApplied.has("summary")).toBe(true);
    expect(suggestions.has("description")).toBe(true);
  });
});

// ── Suppression filtering ─────────────────────────────────────────────────────

describe("suppression filtering", () => {
  test("suggestion with rejected hash is suppressed and not returned", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    // First call to get the hash
    const { suggestions: first } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    const suggestion = first.get("summary");
    expect(suggestion?.kind).toBe("single");
    if (suggestion?.kind !== "single") return;

    const rejectedHash = suggestion.hash;

    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    // Second call with the hash in rejected events
    const { suggestions: second } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
      events: [
        {
          type: "rejected",
          field: "summary",
          suggestion: { hash: rejectedHash, summary: "A summary" },
          at: new Date().toISOString(),
          model: "gpt-4o-mini",
        },
      ],
    });

    expect(second.has("summary")).toBe(false);
  });

  test("suggestion with non-matching hash is NOT suppressed", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "Different summary" } } as never);

    const { suggestions } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
      events: [
        {
          type: "rejected",
          field: "summary",
          suggestion: { hash: "different-hash-abc", summary: "Old summary" },
          at: new Date().toISOString(),
          model: "gpt-4o-mini",
        },
      ],
    });

    expect(suggestions.has("summary")).toBe(true);
  });

  test("suppression is field-specific: rejected hash for one field does not suppress another", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    const { suggestions: first } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    const summaryHash = (first.get("summary") as { kind: "single"; hash: string })?.hash;

    vi.mocked(generateText).mockResolvedValue({ output: { value: "A description" } } as never);

    const { suggestions: second } = await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "description",
      config: MOCK_CONFIG,
      events: [
        {
          type: "rejected",
          field: "summary",
          suggestion: { hash: summaryHash, summary: "A summary" },
          at: new Date().toISOString(),
          model: "gpt-4o-mini",
        },
      ],
    });

    expect(second.has("description")).toBe(true);
  });
});

// ── Preset handling ───────────────────────────────────────────────────────────

describe("preset handling", () => {
  test("fields that do not opt into the preset are skipped", async () => {
    const contract = {
      schema: testSchema,
      presets: [
        {
          id: "expand",
          label: "Expand",
          instruction: "Write in more detail.",
          appliesTo: "text" as const,
        },
      ],
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          autoApply: { policy: "never" as const },
          presetIds: ["expand"],
        },
        description: {
          systemPrompt: () => "Write a description.",
          autoApply: { policy: "never" as const },
          // no presetIds — does not opt into "expand"
        },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "result" } } as never);

    await runRefine({
      contract,
      currentData: { name: "Cumin" },
      preset: "expand",
      config: MOCK_CONFIG,
    });

    // Only 'summary' opted into 'expand', 'description' is skipped
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  test("preset instruction is appended to system prompt", async () => {
    const contract = {
      schema: testSchema,
      presets: [
        {
          id: "expand",
          label: "Expand",
          instruction: "Write in more detail.",
          appliesTo: "text" as const,
        },
      ],
      fields: {
        summary: {
          systemPrompt: () => "Write a summary.",
          autoApply: { policy: "never" as const },
          presetIds: ["expand"],
        },
      },
    };

    vi.mocked(generateText).mockResolvedValue({ output: { value: "result" } } as never);

    await runRefine({
      contract,
      currentData: { name: "Cumin" },
      preset: "expand",
      config: MOCK_CONFIG,
    });

    const call = vi.mocked(generateText).mock.calls[0][0] as { system: string };
    expect(call.system).toContain("Write a summary.");
    expect(call.system).toContain("Write in more detail.");
  });
});

// ── Structural prohibition: sibling-locale source ─────────────────────────────

describe("structural prohibition — sibling-locale source", () => {
  test("throws when sourceContext.kind is 'sibling-locale'", async () => {
    const siblingSource = {
      kind: "sibling-locale",
      sourceRef: { id: "basil-en", kind: "ingredient" },
      sourceData: { name: "Basil" },
      sourceLocale: "en",
      targetLocale: "de",
      fieldHashes: {},
    };

    await expect(
      runRefine({
        contract: baseContract,
        currentData: { name: "Basilikum" },
        sourceContext: siblingSource as never,
        config: MOCK_CONFIG,
      }),
    ).rejects.toThrow(/sibling-locale/);
  });

  test("does not call generateText when sibling-locale source is rejected", async () => {
    const siblingSource = {
      kind: "sibling-locale",
      sourceRef: { id: "basil-en", kind: "ingredient" },
      sourceData: { name: "Basil" },
      sourceLocale: "en",
      targetLocale: "de",
      fieldHashes: {},
    };

    await expect(
      runRefine({
        contract: baseContract,
        currentData: { name: "Basilikum" },
        sourceContext: siblingSource as never,
        config: MOCK_CONFIG,
      }),
    ).rejects.toThrow();

    expect(vi.mocked(generateText)).not.toHaveBeenCalled();
  });

  test("allows non-sibling-locale source contexts", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "result" } } as never);

    // Should NOT throw for a non-sibling source
    await expect(
      runRefine({
        contract: baseContract,
        currentData: { name: "Cumin" },
        sourceContext: { kind: "text", content: "some source text" } as never,
        config: MOCK_CONFIG,
      }),
    ).resolves.toBeDefined();
  });
});

// ── Sinks threading ───────────────────────────────────────────────────────────

describe("runRefine — sinks threading", () => {
  test("passes sinks to createProvider when provided in params", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);
    const sink = { emit: vi.fn() };

    await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
      sinks: [sink],
    });

    expect(vi.mocked(createProvider)).toHaveBeenCalledWith(MOCK_CONFIG, { sinks: [sink] });
  });

  test("passes undefined for options when no sinks provided", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { value: "A summary" } } as never);

    await runRefine({
      contract: baseContract,
      currentData: { name: "Cumin" },
      target: "summary",
      config: MOCK_CONFIG,
    });

    expect(vi.mocked(createProvider)).toHaveBeenCalledWith(MOCK_CONFIG, undefined);
  });
});
