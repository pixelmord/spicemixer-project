// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

import { InlineTextSuggestion } from "../src/components/inline-text-suggestion";
import { InlineArraySuggestion } from "../src/components/inline-array-suggestion";
import { InlineEnumSuggestion } from "../src/components/inline-enum-suggestion";
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

// ── InlineTextSuggestion ──────────────────────────────────────────────────────

describe("InlineTextSuggestion", () => {
  test("renders nothing when no suggestion and no retranslate", async () => {
    const flow = makeFlow({});
    const screen = await renderWithFlow(
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    expect(screen.container.firstChild).toBeNull();
  });

  test("renders the suggestion value", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByText(String(textSuggestion.value))).toBeVisible();
  });

  test("calls onApply and recordAccept when accepted", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineTextSuggestion fieldPath="description" onApply={onApply} />,
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
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    await screen.getByRole("button", { name: /reject/i }).click();
    expect(flow.accessors["description"].recordReject).toHaveBeenCalledWith(textSuggestion.hash);
  });

  test("calls markViewed on mount when suggestion is present", async () => {
    const flow = makeFlow({ description: textSuggestion });
    void renderWithFlow(<InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />, flow);
    await vi.waitFor(() => expect(flow.accessors["description"].markViewed).toHaveBeenCalled());
  });
});

// ── InlineArraySuggestion ─────────────────────────────────────────────────────

describe("InlineArraySuggestion", () => {
  test("renders all tag chips from a single array suggestion", async () => {
    const flow = makeFlow({ tags: arraySuggestion });
    const screen = await renderWithFlow(
      <InlineArraySuggestion fieldPath="tags" onApply={vi.fn()} />,
      flow,
    );
    for (const tag of arraySuggestion.value as string[]) {
      await expect
        .element(screen.getByRole("button", { name: new RegExp(`\\+ ${tag}`) }))
        .toBeVisible();
    }
  });

  test("filters out chips already in existingItems", async () => {
    const flow = makeFlow({ tags: arraySuggestion });
    const screen = await renderWithFlow(
      <InlineArraySuggestion fieldPath="tags" existingItems={["dessert"]} onApply={vi.fn()} />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /\+ dessert/ }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: /\+ spiced/ })).toBeVisible();
  });

  test("renders empty-state message when every chip is filtered out", async () => {
    const flow = makeFlow({ tags: arraySuggestion });
    const screen = await renderWithFlow(
      <InlineArraySuggestion
        fieldPath="tags"
        existingItems={["dessert", "spiced", "baking"]}
        onApply={vi.fn()}
      />,
      flow,
    );
    await expect.element(screen.getByText(/no new suggestions/i)).toBeVisible();
  });

  test("'Add all' calls onApply with the filtered set (no existing items)", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ tags: arraySuggestion });
    const screen = await renderWithFlow(
      <InlineArraySuggestion fieldPath="tags" existingItems={["dessert"]} onApply={onApply} />,
      flow,
    );
    await screen.getByRole("button", { name: /add all/i }).click();
    expect(onApply).toHaveBeenCalledWith(["spiced", "baking"]);
  });
});

// ── Choice variant — single-pick (via InlineTextSuggestion) ───────────────────

describe("InlineTextSuggestion — choice single-pick", () => {
  test("renders all candidates", async () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    const screen = await renderWithFlow(
      <InlineTextSuggestion fieldPath="category" onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByText("Option A")).toBeVisible();
    await expect.element(screen.getByText("Option B")).toBeVisible();
  });

  test("renders 'Choose one' label", async () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    const screen = await renderWithFlow(
      <InlineTextSuggestion fieldPath="category" onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByText(/choose one/i)).toBeVisible();
  });

  test("accept on candidate calls onApply and recordAccept", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ category: choiceSingleSuggestion });
    const screen = await renderWithFlow(
      <InlineTextSuggestion fieldPath="category" onApply={onApply} />,
      flow,
    );
    await screen
      .getByRole("button", { name: /accept/i })
      .first()
      .click();
    expect(onApply).toHaveBeenCalledWith("Option A");
    expect(flow.accessors["category"].recordAccept).toHaveBeenCalledWith("hash-a", "Option A");
  });
});

// ── Choice variant — multi-pick (via InlineArraySuggestion) ────────────────────

describe("InlineArraySuggestion — choice multi-pick", () => {
  test("renders checkboxes for each candidate", async () => {
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    const screen = await renderWithFlow(
      <InlineArraySuggestion fieldPath="tags" onApply={vi.fn()} />,
      flow,
    );
    await vi.waitFor(() => expect(screen.getByRole("checkbox").elements()).toHaveLength(3));
  });

  test("Apply selected calls onApply with selected values", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    const screen = await renderWithFlow(
      <InlineArraySuggestion fieldPath="tags" onApply={onApply} />,
      flow,
    );
    await screen.getByRole("checkbox").first().click();
    await screen.getByRole("button", { name: /apply selected/i }).click();
    expect(onApply).toHaveBeenCalledWith(["Tag A"]);
  });
});

// ── Retranslate ───────────────────────────────────────────────────────────────

describe("Retranslate affordance (via InlineTextSuggestion)", () => {
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
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate from en/i }))
      .toBeVisible();
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
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate/i }))
      .not.toBeInTheDocument();
  });

  test("Retranslate button has stale indicator when isStale is true", async () => {
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
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /retranslate from en/i }))
      .toHaveAttribute("data-stale", "true");
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
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    await screen.getByRole("button", { name: /retranslate from en/i }).click();
    expect(retranslate).toHaveBeenCalled();
  });
});

// ── sourceSlot layout (via InlineTextSuggestion) ──────────────────────────────

describe("sourceSlot layout", () => {
  test("renders sourceSlot content when provided", async () => {
    const flow = makeFlow({ description: textSuggestion });
    const screen = await renderWithFlow(
      <InlineTextSuggestion
        fieldPath="description"
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
      <InlineTextSuggestion fieldPath="description" onApply={vi.fn()} />,
      flow,
    );
    await expect.element(screen.getByText("source-content")).not.toBeInTheDocument();
  });
});

// ── InlineEnumSuggestion ──────────────────────────────────────────────────────

describe("InlineEnumSuggestion", () => {
  const enumSuggestion: FieldSuggestion = {
    kind: "single",
    value: "Italian",
    confidence: "high",
    summary: "",
    hash: "enum-1",
    traceId: "trace-enum-1",
  };

  test("renders the enum value", async () => {
    const flow = makeFlow({ recipeCuisine: enumSuggestion });
    const screen = await renderWithFlow(
      <InlineEnumSuggestion
        fieldPath="recipeCuisine"
        options={["Italian", "Mexican", "Thai"]}
        onApply={vi.fn()}
      />,
      flow,
    );
    await expect.element(screen.getByText("Italian")).toBeVisible();
  });

  test("accept calls onApply + recordAccept", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ recipeCuisine: enumSuggestion });
    const screen = await renderWithFlow(
      <InlineEnumSuggestion fieldPath="recipeCuisine" options={["Italian"]} onApply={onApply} />,
      flow,
    );
    await screen.getByRole("button", { name: /accept/i }).click();
    expect(onApply).toHaveBeenCalledWith("Italian");
    expect(flow.accessors["recipeCuisine"].recordAccept).toHaveBeenCalledWith("enum-1", "Italian");
  });
});
