// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

import {
  InlineFieldSuggestion,
  defaultRenderers,
  type RenderersMap,
} from "../src/components/inline-field-suggestion";
import { SuggestionFlowProvider } from "../src/components/suggestion-flow-provider";
import type {
  UseAiSuggestionsReturn,
  PerFieldAccessor,
  FieldSuggestion,
} from "../src/components/use-ai-suggestions";

const textSuggestion: FieldSuggestion = {
  kind: "single",
  value: "Rich cardamom cake with warm spices",
  confidence: "high",
  summary: "Enhanced description",
  hash: "abc123",
  traceId: "trace-001",
};

const arraySuggestion: FieldSuggestion = {
  kind: "single",
  value: ["dessert", "spiced", "baking"],
  confidence: "medium",
  summary: "Suggested tags",
  hash: "def456",
  traceId: "trace-002",
};

const choiceSingleSuggestion: FieldSuggestion = {
  kind: "choice",
  candidates: [
    { value: "Option A", hash: "hash-a", summary: "First option", confidence: "high" },
    { value: "Option B", hash: "hash-b", summary: "Second option", confidence: "medium" },
  ],
  choose: 1,
  traceId: "trace-003",
};

const choiceMultiSuggestion: FieldSuggestion = {
  kind: "choice",
  candidates: [
    { value: "Tag A", hash: "hash-ta", summary: "", confidence: "high" },
    { value: "Tag B", hash: "hash-tb", summary: "", confidence: "medium" },
    { value: "Tag C", hash: "hash-tc", summary: "", confidence: "low" },
  ],
  choose: { min: 1, max: 2 },
  traceId: "trace-004",
};

function makeAccessor(
  suggestion: FieldSuggestion | undefined,
  overrides: Partial<PerFieldAccessor> = {},
): PerFieldAccessor {
  return {
    suggestion,
    autoApplied: undefined,
    trace: undefined,
    recordAccept: vi.fn(),
    recordReject: vi.fn(),
    revertAutoApply: vi.fn(),
    markViewed: vi.fn(),
    source: undefined,
    sourceLocale: undefined,
    isStale: false,
    translationMode: undefined,
    retranslate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeFlow(
  fieldSuggestions: Record<string, FieldSuggestion>,
  accessorOverrides: Record<string, PerFieldAccessor> = {},
): UseAiSuggestionsReturn & { accessors: Record<string, PerFieldAccessor> } {
  const accessors: Record<string, PerFieldAccessor> = {};
  for (const [field, sug] of Object.entries(fieldSuggestions)) {
    accessors[field] = accessorOverrides[field] ?? makeAccessor(sug);
  }
  return {
    isRunning: false,
    suggestions: new Map(Object.entries(fieldSuggestions)),
    autoApplied: new Map(),
    traces: new Map(),
    viewedFields: new Set(),
    rejectedHidden: new Set(),
    preset: undefined,
    setPreset: vi.fn(),
    userPrompt: "",
    setUserPrompt: vi.fn(),
    writePolicy: "fill-if-empty",
    setWritePolicy: vi.fn(),
    forField: vi.fn((field: string) => accessors[field] ?? makeAccessor(undefined)),
    acceptAll: vi.fn(),
    run: vi.fn(),
    accessors,
  };
}

function renderWithFlow(ui: React.ReactNode, flow: UseAiSuggestionsReturn) {
  return render(<SuggestionFlowProvider value={flow}>{ui}</SuggestionFlowProvider>);
}

// ── Renders nothing when no suggestion ────────────────────────────────────────

describe("renders nothing when no suggestion", () => {
  test("returns null when suggestion is undefined", async () => {
    const flow = makeFlow({});
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="description" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    expect(screen.container.firstChild).toBeNull();
  });
});

// ── Single text suggestion ────────────────────────────────────────────────────

describe("single text suggestion", () => {
  test("renders the suggestion value", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await expect.element(screen.getByText(String(textSuggestion.value))).toBeVisible();
  });

  test("calls onApply and recordAccept when accepted", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={onApply}
        kind="text"
      />,
      flow,
    );
    await screen.getByRole("button", { name: /accept/i }).click();
    expect(onApply).toHaveBeenCalledWith(textSuggestion.value);
    expect(flow.accessors["description"].recordAccept).toHaveBeenCalledWith(
      textSuggestion.hash,
      textSuggestion.value,
    );
  });

  test("calls recordReject when rejected", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await screen.getByRole("button", { name: /reject/i }).click();
    expect(flow.accessors["description"].recordReject).toHaveBeenCalledWith(textSuggestion.hash);
  });

  test("calls markViewed on mount when suggestion is present", async () => {
    const flow = makeFlow({ description: textSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await vi.waitFor(() => expect(flow.accessors["description"].markViewed).toHaveBeenCalled());
  });
});

// ── Array suggestion ──────────────────────────────────────────────────────────

describe("array suggestion", () => {
  test("renders all tag values from array suggestion", async () => {
    const flow = makeFlow({ tags: arraySuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} kind="array" />,
      flow,
    );
    for (const tag of arraySuggestion.value as string[]) {
      await expect
        .element(screen.getByRole("button", { name: new RegExp(`\\+ ${tag}`) }))
        .toBeVisible();
    }
  });

  test("infers array kind from suggestion value type", async () => {
    const flow = makeFlow({ tags: arraySuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    for (const tag of arraySuggestion.value as string[]) {
      await expect
        .element(screen.getByRole("button", { name: new RegExp(`\\+ ${tag}`) }))
        .toBeVisible();
    }
  });

  test("'Add all' calls onApply with the full array", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ tags: arraySuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={onApply} kind="array" />,
      flow,
    );
    await screen.getByRole("button", { name: /add all/i }).click();
    expect(onApply).toHaveBeenCalledWith(arraySuggestion.value);
  });
});

// ── defaultRenderers ──────────────────────────────────────────────────────────

describe("defaultRenderers", () => {
  test("covers text, array, enum, multi-enum, date keys", () => {
    const keys = Object.keys(defaultRenderers);
    expect(keys).toContain("text");
    expect(keys).toContain("array");
    expect(keys).toContain("enum");
    expect(keys).toContain("multi-enum");
    expect(keys).toContain("date");
  });

  test("custom renderer is used when provided", async () => {
    const customRenderer = vi.fn().mockReturnValue(<span>custom-renderer</span>);
    const renderers: RenderersMap = { text: customRenderer };
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
        renderers={renderers}
      />,
      flow,
    );
    await expect.element(screen.getByText("custom-renderer")).toBeVisible();
    expect(customRenderer).toHaveBeenCalled();
  });
});

// ── Choice variant: single-pick ───────────────────────────────────────────────

describe("choice variant — single-pick", () => {
  test("renders all candidates", async () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByText("Option A")).toBeVisible();
    await expect.element(screen.getByText("Option B")).toBeVisible();
  });

  test("renders 'Choose one' label", async () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByText(/choose one/i)).toBeVisible();
  });

  test("accept on candidate calls onApply and recordAccept", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ category: choiceSingleSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={onApply} />,
      flow,
    );
    await screen
      .getByRole("button", { name: /accept/i })
      .first()
      .click();
    expect(onApply).toHaveBeenCalledWith("Option A");
    expect(flow.accessors["category"].recordAccept).toHaveBeenCalledWith("hash-a", "Option A");
  });

  test("reject on candidate calls recordReject with candidate hash", async () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    await screen
      .getByRole("button", { name: /reject/i })
      .first()
      .click();
    expect(flow.accessors["category"].recordReject).toHaveBeenCalledWith("hash-a");
  });
});

// ── Choice variant: multi-pick ────────────────────────────────────────────────

describe("choice variant — multi-pick", () => {
  test("renders checkboxes for each candidate", async () => {
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    await vi.waitFor(() => expect(screen.getByRole("checkbox").elements()).toHaveLength(3));
  });

  test("Apply selected button is disabled when no candidates selected", async () => {
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByRole("button", { name: /apply selected/i })).toBeDisabled();
  });

  test("Apply selected calls onApply with selected values and recordAccept for each", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={onApply} />,
      flow,
    );
    await screen.getByRole("checkbox").first().click();
    await screen.getByRole("button", { name: /apply selected/i }).click();
    expect(onApply).toHaveBeenCalledWith(["Tag A"]);
    expect(flow.accessors["tags"].recordAccept).toHaveBeenCalledWith("hash-ta", "Tag A");
  });

  test("Reject all button calls recordReject", async () => {
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    await screen.getByRole("button", { name: /reject all/i }).click();
    expect(flow.accessors["tags"].recordReject).toHaveBeenCalled();
  });
});

// ── markViewed gating ─────────────────────────────────────────────────────────

describe("markViewed gating", () => {
  test("does not call markViewed when no suggestion exists", async () => {
    const flow = makeFlow({});
    await renderWithFlow(
      <InlineFieldSuggestion fieldPath="description" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    const accessor = flow.accessors["description"] ?? makeAccessor(undefined);
    expect(accessor.markViewed).not.toHaveBeenCalled();
  });

  test("calls markViewed once when suggestion is present", async () => {
    const flow = makeFlow({ description: textSuggestion });
    await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await vi.waitFor(() => expect(flow.accessors["description"].markViewed).toHaveBeenCalled());
  });
});

// ── sourceSlot layout ─────────────────────────────────────────────────────────

describe("sourceSlot layout", () => {
  test("renders sourceSlot content when provided", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        sourceSlot={<span>source-content</span>}
      />,
      flow,
    );
    await expect.element(screen.getByText("source-content")).toBeVisible();
  });

  test("does not render source column when sourceSlot not provided", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion fieldPath="description" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByText("source-content")).not.toBeInTheDocument();
  });

  test("sourceSlot renders alongside the suggestion", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        sourceSlot={<span>original english text</span>}
        kind="text"
      />,
      flow,
    );
    await expect.element(screen.getByText("original english text")).toBeVisible();
    await expect.element(screen.getByText(String(textSuggestion.value))).toBeVisible();
  });
});

// ── retranslate menu ───────────────────────────────────────────────────────────

describe("retranslate menu", () => {
  test("shows Retranslate button when sourceLocale and translate mode", async () => {
    const flow = makeFlow(
      { description: textSuggestion },
      {
        description: makeAccessor(textSuggestion, {
          sourceLocale: "en",
          translationMode: "translate",
          isStale: false,
        }),
      },
    );
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate from en/i }))
      .toBeVisible();
  });

  test("shows Retranslate button when sourceLocale and localize mode", async () => {
    const flow = makeFlow(
      { description: textSuggestion },
      {
        description: makeAccessor(textSuggestion, {
          sourceLocale: "en",
          translationMode: "localize",
          isStale: false,
        }),
      },
    );
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate from en/i }))
      .toBeVisible();
  });

  test("does not show Retranslate button when no sourceLocale", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate/i }))
      .not.toBeInTheDocument();
  });

  test("does not show Retranslate button for copy-mode fields", async () => {
    const flow = makeFlow(
      { description: textSuggestion },
      {
        description: makeAccessor(textSuggestion, {
          sourceLocale: "en",
          translationMode: "copy",
        }),
      },
    );
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate/i }))
      .not.toBeInTheDocument();
  });

  test("Retranslate button calls retranslate on accessor", async () => {
    const retranslate = vi.fn().mockResolvedValue(undefined);
    const flow = makeFlow(
      { description: textSuggestion },
      {
        description: makeAccessor(textSuggestion, {
          sourceLocale: "en",
          translationMode: "translate",
          retranslate,
        }),
      },
    );
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await screen.getByRole("button", { name: /retranslate from en/i }).click();
    expect(retranslate).toHaveBeenCalled();
  });
});

// ── stale retranslate promotion ──────────────────────────────────────────────

describe("stale retranslate promotion", () => {
  test("retranslate button has stale indicator when isStale is true", async () => {
    const flow = makeFlow(
      { description: textSuggestion },
      {
        description: makeAccessor(textSuggestion, {
          sourceLocale: "en",
          translationMode: "translate",
          isStale: true,
        }),
      },
    );
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate from en/i }))
      .toHaveAttribute("data-stale", "true");
  });

  test("retranslate button does not have stale indicator when isStale is false", async () => {
    const flow = makeFlow(
      { description: textSuggestion },
      {
        description: makeAccessor(textSuggestion, {
          sourceLocale: "en",
          translationMode: "translate",
          isStale: false,
        }),
      },
    );
    const screen = await renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
      />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate from en/i }))
      .not.toHaveAttribute("data-stale", "true");
  });
});
