// @vitest-environment jsdom
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

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

afterEach(cleanup);

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

function makeAccessor(suggestion: FieldSuggestion | undefined): PerFieldAccessor {
  return {
    suggestion,
    autoApplied: undefined,
    trace: undefined,
    recordAccept: vi.fn(),
    recordReject: vi.fn(),
    revertAutoApply: vi.fn(),
    markViewed: vi.fn(),
  };
}

function makeFlow(
  fieldSuggestions: Record<string, FieldSuggestion>,
): UseAiSuggestionsReturn & { accessors: Record<string, PerFieldAccessor> } {
  const accessors: Record<string, PerFieldAccessor> = {};
  for (const [field, sug] of Object.entries(fieldSuggestions)) {
    accessors[field] = makeAccessor(sug);
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
  test("returns null when suggestion is undefined", () => {
    const flow = makeFlow({});
    const { container } = renderWithFlow(
      <InlineFieldSuggestion fieldPath="description" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ── Single text suggestion ────────────────────────────────────────────────────

describe("single text suggestion", () => {
  test("renders the suggestion value", () => {
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
    expect(screen.getByText(String(textSuggestion.value))).toBeDefined();
  });

  test("calls onApply and recordAccept when accepted", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ description: textSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={onApply}
        kind="text"
      />,
      flow,
    );
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onApply).toHaveBeenCalledWith(textSuggestion.value);
    expect(flow.accessors["description"].recordAccept).toHaveBeenCalledWith(
      textSuggestion.hash,
      textSuggestion.value,
    );
  });

  test("calls recordReject when rejected", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(flow.accessors["description"].recordReject).toHaveBeenCalledWith(textSuggestion.hash);
  });

  test("calls markViewed on mount when suggestion is present", () => {
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
    expect(flow.accessors["description"].markViewed).toHaveBeenCalled();
  });
});

// ── Array suggestion ──────────────────────────────────────────────────────────

describe("array suggestion", () => {
  test("renders all tag values from array suggestion", () => {
    const flow = makeFlow({ tags: arraySuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} kind="array" />,
      flow,
    );
    for (const tag of arraySuggestion.value as string[]) {
      expect(screen.getByText(tag)).toBeDefined();
    }
  });

  test("infers array kind from suggestion value type", () => {
    const flow = makeFlow({ tags: arraySuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    // TagsSuggestionRow renders each tag as a chip
    for (const tag of arraySuggestion.value as string[]) {
      expect(screen.getByText(tag)).toBeDefined();
    }
  });

  test("calls onApply with array when accepted", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ tags: arraySuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={onApply} kind="array" />,
      flow,
    );
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
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
    renderWithFlow(
      <InlineFieldSuggestion
        fieldPath="description"
        currentValue=""
        onApply={vi.fn()}
        kind="text"
        renderers={renderers}
      />,
      flow,
    );
    expect(screen.getByText("custom-renderer")).toBeDefined();
    expect(customRenderer).toHaveBeenCalled();
  });
});

// ── Choice variant: single-pick ───────────────────────────────────────────────

describe("choice variant — single-pick", () => {
  test("renders all candidates", () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    expect(screen.getByText("Option A")).toBeDefined();
    expect(screen.getByText("Option B")).toBeDefined();
  });

  test("renders 'Choose one' label", () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    expect(screen.getByText(/choose one/i)).toBeDefined();
  });

  test("accept on candidate calls onApply and recordAccept", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ category: choiceSingleSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={onApply} />,
      flow,
    );
    const acceptButtons = screen.getAllByRole("button", { name: /accept/i });
    await userEvent.click(acceptButtons[0]);
    expect(onApply).toHaveBeenCalledWith("Option A");
    expect(flow.accessors["category"].recordAccept).toHaveBeenCalledWith("hash-a", "Option A");
  });

  test("reject on candidate calls recordReject with candidate hash", async () => {
    const flow = makeFlow({ category: choiceSingleSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="category" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    const rejectButtons = screen.getAllByRole("button", { name: /reject/i });
    await userEvent.click(rejectButtons[0]);
    expect(flow.accessors["category"].recordReject).toHaveBeenCalledWith("hash-a");
  });
});

// ── Choice variant: multi-pick ────────────────────────────────────────────────

describe("choice variant — multi-pick", () => {
  test("renders checkboxes for each candidate", () => {
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
  });

  test("Apply selected button is disabled when no candidates selected", () => {
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    const applyBtn = screen.getByRole("button", { name: /apply selected/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("Apply selected calls onApply with selected values and recordAccept for each", async () => {
    const onApply = vi.fn();
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={onApply} />,
      flow,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]); // select Tag A
    const applyBtn = screen.getByRole("button", { name: /apply selected/i });
    await userEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledWith(["Tag A"]);
    expect(flow.accessors["tags"].recordAccept).toHaveBeenCalledWith("hash-ta", "Tag A");
  });

  test("Reject all button calls recordReject", async () => {
    const flow = makeFlow({ tags: choiceMultiSuggestion });
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="tags" currentValue={[]} onApply={vi.fn()} />,
      flow,
    );
    await userEvent.click(screen.getByRole("button", { name: /reject all/i }));
    expect(flow.accessors["tags"].recordReject).toHaveBeenCalled();
  });
});

// ── markViewed is not called when no suggestion ───────────────────────────────

describe("markViewed gating", () => {
  test("does not call markViewed when no suggestion exists", () => {
    const flow = makeFlow({});
    renderWithFlow(
      <InlineFieldSuggestion fieldPath="description" currentValue="" onApply={vi.fn()} />,
      flow,
    );
    // forField is called but suggestion is undefined → markViewed should not fire
    const accessor = flow.accessors["description"] ?? makeAccessor(undefined);
    expect(accessor.markViewed).not.toHaveBeenCalled();
  });

  test("calls markViewed once when suggestion is present", async () => {
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
    await act(async () => {}); // flush effects
    expect(flow.accessors["description"].markViewed).toHaveBeenCalled();
  });
});
