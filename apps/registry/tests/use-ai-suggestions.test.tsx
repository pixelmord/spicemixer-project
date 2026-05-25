import { renderHook } from "vitest-browser-react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  useAiSuggestions,
  hashFieldValue,
  MERGE_INSTRUCTION,
  type UseAiSuggestionsInput,
} from "../src/components/use-ai-suggestions";

afterEach(() => {
  vi.clearAllMocks();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockEntityRef = { kind: "recipe", id: "cardamom-cake" };
const mockOrigin = {
  surface: "admin",
  action: "refine",
  userInitiated: true,
  runId: "run-1",
  triggeredBy: "editor" as const,
};
const mockEventLog = {
  read: vi.fn().mockResolvedValue([]),
  append: vi.fn().mockResolvedValue(undefined),
};
const mockContract = { presets: [], fields: {} };

const descriptionSuggestion = {
  kind: "single" as const,
  value: "Rich cardamom cake",
  confidence: "high" as const,
  summary: "Rich and aromatic",
  hash: "abc123",
  traceId: "trace-001",
};

const tagsSuggestion = {
  kind: "single" as const,
  value: ["dessert", "spiced"],
  confidence: "medium" as const,
  summary: "Dessert and spiced tags",
  hash: "def456",
  traceId: "trace-002",
};

const traceDescription = {
  traceId: "trace-001",
  model: "claude-sonnet-4-6",
  runtimeMs: 800,
};
const traceTags = {
  traceId: "trace-002",
  model: "claude-sonnet-4-6",
  runtimeMs: 400,
};

function makeMockOnRefine(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    suggestions: {
      description: descriptionSuggestion,
      tags: tagsSuggestion,
      ...overrides,
    },
    autoApplied: {},
    traces: {
      description: traceDescription,
      tags: traceTags,
    },
  });
}

function makeInput(extra: Partial<UseAiSuggestionsInput> = {}): UseAiSuggestionsInput {
  return {
    contract: mockContract,
    aiEventLog: mockEventLog,
    entityRef: mockEntityRef,
    origin: mockOrigin,
    onRefine: makeMockOnRefine(),
    ...extra,
  };
}

// ── Run-state transitions ─────────────────────────────────────────────────────

describe("run-state transitions", () => {
  test("isRunning starts as false", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.isRunning).toBe(false);
  });

  test("isRunning is true while run() is executing", async () => {
    let resolve!: (v: unknown) => void;
    const blocking = new Promise((r) => {
      resolve = r;
    });
    const onRefine = vi.fn().mockReturnValue(blocking);
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput({ onRefine })));

    await act(() => {
      void result.current.run();
    });
    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      resolve({ suggestions: {}, autoApplied: {}, traces: {} });
    });
    expect(result.current.isRunning).toBe(false);
  });

  test("suggestions are populated after run()", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.suggestions.has("description")).toBe(true);
    expect(result.current.suggestions.has("tags")).toBe(true);
  });

  test("traces are populated after run()", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.traces.has("description")).toBe(true);
    expect(result.current.traces.get("description")?.model).toBe("claude-sonnet-4-6");
  });

  test("viewedFields and rejectedHidden reset on each run()", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("description").markViewed();
    });
    await act(() => {
      result.current.forField("tags").recordReject();
    });

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.viewedFields.size).toBe(0);
    expect(result.current.rejectedHidden.size).toBe(0);
  });

  test("run() calls onRefine", async () => {
    const onRefine = makeMockOnRefine();
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput({ onRefine })));
    await act(async () => {
      await result.current.run();
    });
    expect(onRefine).toHaveBeenCalledTimes(1);
  });

  test("isRunning resets to false even when onRefine throws", async () => {
    const onRefine = vi.fn().mockRejectedValue(new Error("network error"));
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput({ onRefine })));
    await act(async () => {
      await result.current.run().catch(() => void 0);
    });
    expect(result.current.isRunning).toBe(false);
  });
});

// ── Per-field forField flows ──────────────────────────────────────────────────

describe("forField", () => {
  test("suggestion is undefined before run()", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.forField("description").suggestion).toBeUndefined();
  });

  test("suggestion is populated after run()", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.forField("description").suggestion).toMatchObject({
      hash: "abc123",
      summary: "Rich and aromatic",
    });
  });

  test("trace is populated after run()", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.forField("description").trace?.traceId).toBe("trace-001");
  });

  test("recordAccept removes suggestion from state", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("description").recordAccept("abc123", "Rich cardamom cake");
    });
    expect(result.current.suggestions.has("description")).toBe(false);
  });

  test("recordAccept calls aiEventLog.append with accepted event", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      result.current.forField("description").recordAccept("abc123", "Rich cardamom cake");
    });
    expect(mockEventLog.append).toHaveBeenCalledWith(
      mockEntityRef,
      expect.objectContaining({ type: "accepted", field: "description" }),
    );
  });

  test("recordReject removes suggestion from state", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("tags").recordReject();
    });
    expect(result.current.suggestions.has("tags")).toBe(false);
  });

  test("recordReject adds field to rejectedHidden", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("tags").recordReject();
    });
    expect(result.current.rejectedHidden.has("tags")).toBe(true);
  });

  test("recordReject calls aiEventLog.append with rejected event", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      result.current.forField("tags").recordReject("def456");
    });
    expect(mockEventLog.append).toHaveBeenCalledWith(
      mockEntityRef,
      expect.objectContaining({ type: "rejected", field: "tags" }),
    );
  });

  test("revertAutoApply removes field from autoApplied", async () => {
    const onRefine = vi.fn().mockResolvedValue({
      suggestions: {},
      autoApplied: {
        description: {
          value: "Auto-applied text",
          hash: "aa1",
          summary: "AI wrote this",
          confidence: "high" as const,
        },
      },
      traces: {},
    });
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput({ onRefine })));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.autoApplied.has("description")).toBe(true);
    await act(() => {
      result.current.forField("description").revertAutoApply();
    });
    expect(result.current.autoApplied.has("description")).toBe(false);
  });

  test("markViewed adds field to viewedFields", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("description").markViewed();
    });
    expect(result.current.viewedFields.has("description")).toBe(true);
  });

  test("markViewed does not add other fields", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("description").markViewed();
    });
    expect(result.current.viewedFields.has("tags")).toBe(false);
  });
});

// ── acceptAll requiresReview gating ──────────────────────────────────────────

describe("acceptAll", () => {
  test("returns requiresReview with all unviewed fields when none are viewed", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    await act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toMatchObject({
      requiresReview: expect.arrayContaining(["description", "tags"]),
    });
  });

  test("returns requiresReview with only unviewed fields when some are viewed", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("description").markViewed();
    });
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    await act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toMatchObject({ requiresReview: ["tags"] });
    expect((outcome as { requiresReview: string[] } | undefined)?.requiresReview).not.toContain(
      "description",
    );
  });

  test("returns void and clears suggestions when all fields are viewed", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("description").markViewed();
    });
    await act(() => {
      result.current.forField("tags").markViewed();
    });
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    await act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toBeUndefined();
    expect(result.current.suggestions.size).toBe(0);
  });

  test("acceptAll appends accepted events to aiEventLog", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    await act(() => {
      result.current.forField("description").markViewed();
    });
    await act(() => {
      result.current.forField("tags").markViewed();
    });
    await act(async () => {
      result.current.acceptAll();
    });
    expect(mockEventLog.append).toHaveBeenCalledWith(
      mockEntityRef,
      expect.objectContaining({ type: "accepted" }),
    );
  });

  test("acceptAll is a no-op (returns void) when no suggestions exist", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    await act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toBeUndefined();
  });
});

// ── Controlled-with-default options ──────────────────────────────────────────

describe("controlled-with-default options", () => {
  test("preset defaults to undefined", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.preset).toBeUndefined();
  });

  test("setPreset updates preset in uncontrolled mode", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(() => {
      result.current.setPreset("expand");
    });
    expect(result.current.preset).toBe("expand");
  });

  test("preset is controlled when presetProp is provided", async () => {
    const { result } = await renderHook(() =>
      useAiSuggestions(makeInput({ presetProp: "translate-de" })),
    );
    expect(result.current.preset).toBe("translate-de");
  });

  test("setPreset calls onPresetChange in controlled mode", async () => {
    const onPresetChange = vi.fn();
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ presetProp: "expand", onPresetChange })),
    );
    await act(() => {
      result.current.setPreset("refine");
    });
    expect(onPresetChange).toHaveBeenCalledWith("refine");
  });

  test("userPrompt defaults to empty string", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.userPrompt).toBe("");
  });

  test("setUserPrompt updates userPrompt in uncontrolled mode", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(() => {
      result.current.setUserPrompt("Make it shorter");
    });
    expect(result.current.userPrompt).toBe("Make it shorter");
  });

  test("writePolicy defaults to fill-if-empty", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.writePolicy).toBe("fill-if-empty");
  });

  test("setWritePolicy updates writePolicy in uncontrolled mode", async () => {
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput()));
    await act(() => {
      result.current.setWritePolicy("replace");
    });
    expect(result.current.writePolicy).toBe("replace");
  });

  test("setWritePolicy calls onWritePolicyChange in controlled mode", async () => {
    const onWritePolicyChange = vi.fn();
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ writePolicyProp: "preserve", onWritePolicyChange })),
    );
    await act(() => {
      result.current.setWritePolicy("replace");
    });
    expect(onWritePolicyChange).toHaveBeenCalledWith("replace");
  });
});

// ── siblingLocale — source + sourceLocale + isStale ──────────────────────────

describe("siblingLocale", () => {
  const siblingData = {
    description: "Aromatic herb from the mint family",
    name: "Basil",
    tags: ["herb", "fresh"],
  };

  const siblingLocale = {
    ref: { kind: "ingredient", id: "basil-en" },
    data: siblingData,
    locale: "en",
    fieldHashes: {
      description: hashFieldValue(siblingData.description),
      name: hashFieldValue(siblingData.name),
      tags: "old-hash-that-differs",
    },
  };

  test("forField returns source value from siblingLocale.data", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput({ siblingLocale })));
    expect(result.current.forField("description").source).toBe(siblingData.description);
  });

  test("forField returns sourceLocale from siblingLocale.locale", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput({ siblingLocale })));
    expect(result.current.forField("description").sourceLocale).toBe("en");
  });

  test("forField source is undefined when no siblingLocale provided", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.forField("description").source).toBeUndefined();
  });

  test("forField sourceLocale is undefined when no siblingLocale provided", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.forField("description").sourceLocale).toBeUndefined();
  });

  test("isStale is false when fieldHash matches current source value", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput({ siblingLocale })));
    expect(result.current.forField("description").isStale).toBe(false);
  });

  test("isStale is true when fieldHash differs from current source value", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput({ siblingLocale })));
    expect(result.current.forField("tags").isStale).toBe(true);
  });

  test("isStale is false when no siblingLocale provided", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.forField("description").isStale).toBe(false);
  });

  test("isStale is false when field not in fieldHashes", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput({ siblingLocale })));
    expect(result.current.forField("unknownField").isStale).toBe(false);
  });
});

// ── translationMode ───────────────────────────────────────────────────────────

describe("translationMode", () => {
  const contractWithTranslation = {
    presets: [],
    fields: {
      description: { translation: { mode: "translate" as const } },
      name: { translation: { mode: "copy" as const } },
      tags: { translation: { mode: "localize" as const } },
      slug: { translation: { mode: "skip" as const } },
    },
  };

  test("translationMode is undefined when field has no translation config", async () => {
    const { result } = await renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.forField("description").translationMode).toBeUndefined();
  });

  test("translationMode returns mode from contract field config", async () => {
    const { result } = await renderHook(() =>
      useAiSuggestions(makeInput({ contract: contractWithTranslation })),
    );
    expect(result.current.forField("description").translationMode).toBe("translate");
    expect(result.current.forField("name").translationMode).toBe("copy");
    expect(result.current.forField("tags").translationMode).toBe("localize");
    expect(result.current.forField("slug").translationMode).toBe("skip");
  });

  test("translationMode is undefined when field not in contract", async () => {
    const { result } = await renderHook(() =>
      useAiSuggestions(makeInput({ contract: contractWithTranslation })),
    );
    expect(result.current.forField("unknown").translationMode).toBeUndefined();
  });
});

// ── retranslate ───────────────────────────────────────────────────────────────

describe("retranslate", () => {
  const siblingLocale = {
    ref: { kind: "ingredient", id: "basil-en" },
    data: { description: "Aromatic herb", name: "Basil" },
    locale: "en",
    fieldHashes: {},
  };

  const contractWithTranslation = {
    presets: [],
    fields: {
      description: { translation: { mode: "translate" as const } },
      name: { translation: { mode: "copy" as const } },
      tags: { translation: { mode: "localize" as const } },
    },
  };

  test("retranslate calls onFill with target=[field] and sourceContext", async () => {
    const onFill = vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.forField("description").retranslate();
    });
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ["description"],
        sourceContext: expect.objectContaining({ kind: "sibling-locale" }),
      }),
    );
  });

  test("retranslate does not call onFill for copy-mode fields", async () => {
    const onFill = vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.forField("name").retranslate();
    });
    expect(onFill).not.toHaveBeenCalled();
  });

  test("retranslate does nothing when no siblingLocale provided", async () => {
    const onFill = vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} });
    const { result, act } = await renderHook(() => useAiSuggestions(makeInput({ onFill })));
    await act(async () => {
      await result.current.forField("description").retranslate();
    });
    expect(onFill).not.toHaveBeenCalled();
  });

  test("retranslate populates suggestions after successful call", async () => {
    const onFill = vi.fn().mockResolvedValue({
      suggestions: { description: descriptionSuggestion },
      autoApplied: {},
      traces: { description: traceDescription },
    });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.forField("description").retranslate();
    });
    expect(result.current.suggestions.has("description")).toBe(true);
  });

  test("retranslate merges suggestions without clearing other fields", async () => {
    const onFill = vi.fn().mockResolvedValue({
      suggestions: { description: descriptionSuggestion },
      autoApplied: {},
      traces: {},
    });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.run();
    });
    onFill.mockResolvedValue({
      suggestions: { description: descriptionSuggestion },
      autoApplied: {},
      traces: {},
    });
    await act(async () => {
      await result.current.forField("description").retranslate();
    });
    expect(result.current.suggestions.has("tags")).toBe(true);
    expect(result.current.suggestions.has("description")).toBe(true);
  });
});

// ── retranslate({ merge }) ────────────────────────────────────────────────────

describe("retranslate merge option", () => {
  const siblingLocale = {
    ref: { kind: "ingredient", id: "basil-en" },
    data: { description: "Aromatic herb", name: "Basil" },
    locale: "en",
    fieldHashes: {},
  };

  const contractWithTranslation = {
    presets: [],
    fields: {
      description: { translation: { mode: "translate" as const } },
      name: { translation: { mode: "copy" as const } },
      slug: { translation: { mode: "skip" as const } },
    },
  };

  test("merge:true passes mergeInstruction to onFill", async () => {
    const onFill = vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.forField("description").retranslate({ merge: true });
    });
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({ mergeInstruction: MERGE_INSTRUCTION }),
    );
  });

  test("merge:false (default) does not pass mergeInstruction to onFill", async () => {
    const onFill = vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.forField("description").retranslate({ merge: false });
    });
    const call = onFill.mock.calls[0][0] as Record<string, unknown>;
    expect(call.mergeInstruction).toBeUndefined();
  });

  test("retranslate() with no opts does not pass mergeInstruction", async () => {
    const onFill = vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.forField("description").retranslate();
    });
    const call = onFill.mock.calls[0][0] as Record<string, unknown>;
    expect(call.mergeInstruction).toBeUndefined();
  });

  test("merge:true on copy-mode field still does not call onFill", async () => {
    const onFill = vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} });
    const { result, act } = await renderHook(() =>
      useAiSuggestions(makeInput({ siblingLocale, onFill, contract: contractWithTranslation })),
    );
    await act(async () => {
      await result.current.forField("name").retranslate({ merge: true });
    });
    expect(onFill).not.toHaveBeenCalled();
  });

  test("MERGE_INSTRUCTION constant is non-empty string", () => {
    expect(typeof MERGE_INSTRUCTION).toBe("string");
    expect(MERGE_INSTRUCTION.length).toBeGreaterThan(0);
  });
});
