// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { useAiSuggestions, type UseAiSuggestionsInput } from "../src/components/use-ai-suggestions";

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
  test("isRunning starts as false", () => {
    const { result } = renderHook((input) => useAiSuggestions(input), {
      initialProps: makeInput(),
    });
    expect(result.current.isRunning).toBe(false);
  });

  test("isRunning is true while run() is executing", async () => {
    let resolve!: (v: unknown) => void;
    const blocking = new Promise((r) => {
      resolve = r;
    });
    const onRefine = vi.fn().mockReturnValue(blocking);
    const { result } = renderHook(() => useAiSuggestions(makeInput({ onRefine })));

    act(() => void result.current.run());
    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      resolve({ suggestions: {}, autoApplied: {}, traces: {} });
    });
    expect(result.current.isRunning).toBe(false);
  });

  test("suggestions are populated after run()", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.suggestions.has("description")).toBe(true);
    expect(result.current.suggestions.has("tags")).toBe(true);
  });

  test("traces are populated after run()", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.traces.has("description")).toBe(true);
    expect(result.current.traces.get("description")?.model).toBe("claude-sonnet-4-6");
  });

  test("viewedFields and rejectedHidden reset on each run()", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("description").markViewed());
    act(() => result.current.forField("tags").recordReject());

    // Second run resets these
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.viewedFields.size).toBe(0);
    expect(result.current.rejectedHidden.size).toBe(0);
  });

  test("run() calls onRefine", async () => {
    const onRefine = makeMockOnRefine();
    const { result } = renderHook(() => useAiSuggestions(makeInput({ onRefine })));
    await act(async () => {
      await result.current.run();
    });
    expect(onRefine).toHaveBeenCalledTimes(1);
  });

  test("isRunning resets to false even when onRefine throws", async () => {
    const onRefine = vi.fn().mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useAiSuggestions(makeInput({ onRefine })));
    await act(async () => {
      await result.current.run().catch(() => void 0);
    });
    expect(result.current.isRunning).toBe(false);
  });
});

// ── Per-field forField flows ──────────────────────────────────────────────────

describe("forField", () => {
  test("suggestion is undefined before run()", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.forField("description").suggestion).toBeUndefined();
  });

  test("suggestion is populated after run()", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.forField("description").suggestion).toMatchObject({
      hash: "abc123",
      summary: "Rich and aromatic",
    });
  });

  test("trace is populated after run()", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.forField("description").trace?.traceId).toBe("trace-001");
  });

  // recordAccept
  test("recordAccept removes suggestion from state", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("description").recordAccept("abc123", "Rich cardamom cake"));
    expect(result.current.suggestions.has("description")).toBe(false);
  });

  test("recordAccept calls aiEventLog.append with accepted event", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
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

  // recordReject
  test("recordReject removes suggestion from state", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("tags").recordReject());
    expect(result.current.suggestions.has("tags")).toBe(false);
  });

  test("recordReject adds field to rejectedHidden", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("tags").recordReject());
    expect(result.current.rejectedHidden.has("tags")).toBe(true);
  });

  test("recordReject calls aiEventLog.append with rejected event", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
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

  // revertAutoApply
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
    const { result } = renderHook(() => useAiSuggestions(makeInput({ onRefine })));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.autoApplied.has("description")).toBe(true);
    act(() => result.current.forField("description").revertAutoApply());
    expect(result.current.autoApplied.has("description")).toBe(false);
  });

  // markViewed
  test("markViewed adds field to viewedFields", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("description").markViewed());
    expect(result.current.viewedFields.has("description")).toBe(true);
  });

  test("markViewed does not add other fields", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("description").markViewed());
    expect(result.current.viewedFields.has("tags")).toBe(false);
  });
});

// ── acceptAll requiresReview gating ──────────────────────────────────────────

describe("acceptAll", () => {
  test("returns requiresReview with all unviewed fields when none are viewed", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toMatchObject({
      requiresReview: expect.arrayContaining(["description", "tags"]),
    });
  });

  test("returns requiresReview with only unviewed fields when some are viewed", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("description").markViewed());
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toMatchObject({ requiresReview: ["tags"] });
    expect((outcome as { requiresReview: string[] } | undefined)?.requiresReview).not.toContain(
      "description",
    );
  });

  test("returns void and clears suggestions when all fields are viewed", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("description").markViewed());
    act(() => result.current.forField("tags").markViewed());
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toBeUndefined();
    expect(result.current.suggestions.size).toBe(0);
  });

  test("acceptAll appends accepted events to aiEventLog", async () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    await act(async () => {
      await result.current.run();
    });
    act(() => result.current.forField("description").markViewed());
    act(() => result.current.forField("tags").markViewed());
    await act(async () => {
      result.current.acceptAll();
    });
    expect(mockEventLog.append).toHaveBeenCalledWith(
      mockEntityRef,
      expect.objectContaining({ type: "accepted" }),
    );
  });

  test("acceptAll is a no-op (returns void) when no suggestions exist", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    // no run() called — suggestions empty
    let outcome: ReturnType<typeof result.current.acceptAll> = undefined;
    act(() => {
      outcome = result.current.acceptAll();
    });
    expect(outcome).toBeUndefined();
  });
});

// ── Controlled-with-default options ──────────────────────────────────────────

describe("controlled-with-default options", () => {
  test("preset defaults to undefined", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.preset).toBeUndefined();
  });

  test("setPreset updates preset in uncontrolled mode", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    act(() => result.current.setPreset("expand"));
    expect(result.current.preset).toBe("expand");
  });

  test("preset is controlled when presetProp is provided", () => {
    const { result } = renderHook(() =>
      useAiSuggestions(makeInput({ presetProp: "translate-de" })),
    );
    expect(result.current.preset).toBe("translate-de");
  });

  test("setPreset calls onPresetChange in controlled mode", () => {
    const onPresetChange = vi.fn();
    const { result } = renderHook(() =>
      useAiSuggestions(makeInput({ presetProp: "expand", onPresetChange })),
    );
    act(() => result.current.setPreset("refine"));
    expect(onPresetChange).toHaveBeenCalledWith("refine");
  });

  test("userPrompt defaults to empty string", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.userPrompt).toBe("");
  });

  test("setUserPrompt updates userPrompt in uncontrolled mode", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    act(() => result.current.setUserPrompt("Make it shorter"));
    expect(result.current.userPrompt).toBe("Make it shorter");
  });

  test("writePolicy defaults to fill-if-empty", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    expect(result.current.writePolicy).toBe("fill-if-empty");
  });

  test("setWritePolicy updates writePolicy in uncontrolled mode", () => {
    const { result } = renderHook(() => useAiSuggestions(makeInput()));
    act(() => result.current.setWritePolicy("replace"));
    expect(result.current.writePolicy).toBe("replace");
  });

  test("setWritePolicy calls onWritePolicyChange in controlled mode", () => {
    const onWritePolicyChange = vi.fn();
    const { result } = renderHook(() =>
      useAiSuggestions(makeInput({ writePolicyProp: "preserve", onWritePolicyChange })),
    );
    act(() => result.current.setWritePolicy("replace"));
    expect(onWritePolicyChange).toHaveBeenCalledWith("replace");
  });
});
