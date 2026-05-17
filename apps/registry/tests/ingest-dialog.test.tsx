// @vitest-environment jsdom
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  FileTextPromptSourcePicker,
  type IngestSource,
} from "../src/components/file-text-prompt-source-picker";
import { IngestDialog } from "../src/components/ingest-dialog";
import { SuggestionFlowProvider } from "../src/components/suggestion-flow-provider";
import type {
  UseAiSuggestionsReturn,
  PerFieldAccessor,
  FieldSuggestion,
  AiPreset,
} from "../src/components/use-ai-suggestions";

afterEach(cleanup);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const samplePresets: AiPreset[] = [
  { id: "default", label: "Default" },
  { id: "detailed", label: "Detailed" },
];

function makeAccessor(suggestion?: FieldSuggestion): PerFieldAccessor {
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
    retranslate: vi.fn(),
  };
}

function makeFlow(overrides: Partial<UseAiSuggestionsReturn> = {}): UseAiSuggestionsReturn {
  return {
    isRunning: false,
    suggestions: new Map(),
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
    forField: vi.fn((_field: string) => makeAccessor()),
    acceptAll: vi.fn(),
    run: vi.fn(),
    ...overrides,
  };
}

const descriptionSuggestion: FieldSuggestion = {
  kind: "single",
  value: "Rich cardamom cake with warm spices",
  confidence: "high",
  summary: "Enhanced description",
  hash: "abc123",
  traceId: "trace-001",
};

const tagsSuggestion: FieldSuggestion = {
  kind: "single",
  value: ["dessert", "spiced", "baking"],
  confidence: "medium",
  summary: "Suggested tags",
  hash: "def456",
  traceId: "trace-002",
};

function renderWithFlow(ui: React.ReactNode, flow: UseAiSuggestionsReturn) {
  return render(<SuggestionFlowProvider value={flow}>{ui}</SuggestionFlowProvider>);
}

// ── FileTextPromptSourcePicker: tabs ─────────────────────────────────────────

describe("FileTextPromptSourcePicker — tabs", () => {
  test("renders three tabs: File, Text, Prompt", () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "File" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Text" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Prompt" })).toBeDefined();
  });

  test("File tab is selected by default", () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    const fileTab = screen.getByRole("tab", { name: "File" });
    expect(fileTab.getAttribute("aria-selected")).toBe("true");
  });

  test("clicking Text tab activates it", async () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    expect(screen.getByRole("tab", { name: "Text" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "File" }).getAttribute("aria-selected")).toBe("false");
  });

  test("clicking Prompt tab activates it", async () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    expect(screen.getByRole("tab", { name: "Prompt" }).getAttribute("aria-selected")).toBe("true");
  });
});

// ── FileTextPromptSourcePicker: file tab ──────────────────────────────────────

describe("FileTextPromptSourcePicker — file tab", () => {
  test("shows file input on File tab", () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/upload file/i)).toBeDefined();
  });

  test("does not show textarea on File tab", () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

// ── FileTextPromptSourcePicker: text tab ──────────────────────────────────────

describe("FileTextPromptSourcePicker — text tab", () => {
  test("shows textarea on Text tab", async () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  test("typing in text tab calls onChange with { kind: 'text', text }", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    await userEvent.type(screen.getByRole("textbox"), "hello");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "text" }));
  });

  test("clearing text tab calls onChange with null", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "hello");
    await userEvent.clear(textarea);
    // Last call should be null
    const calls = onChange.mock.calls;
    expect(calls[calls.length - 1][0]).toBeNull();
  });
});

// ── FileTextPromptSourcePicker: prompt tab ────────────────────────────────────

describe("FileTextPromptSourcePicker — prompt tab", () => {
  test("shows prompt textarea on Prompt tab", async () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  test("typing calls onChange with { kind: 'prompt', prompt }", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    await userEvent.type(screen.getByRole("textbox"), "generate a recipe");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "prompt" }));
  });

  test("switching tabs calls onChange with null", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    // After tab switch, onChange called with null
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

// ── FileTextPromptSourcePicker: tabpanel ──────────────────────────────────────

describe("FileTextPromptSourcePicker — tabpanel", () => {
  test("renders a tabpanel", () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("tabpanel")).toBeDefined();
  });

  test("tabpanel changes content when tab switches", async () => {
    render(<FileTextPromptSourcePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/upload file/i)).toBeDefined();
    await userEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    expect(screen.queryByLabelText(/upload file/i)).toBeNull();
    expect(screen.getByRole("textbox")).toBeDefined();
  });
});

// ── IngestDialog: visibility ──────────────────────────────────────────────────

describe("IngestDialog — visibility", () => {
  test("renders nothing when open is false", () => {
    const flow = makeFlow();
    const { container } = renderWithFlow(
      <IngestDialog open={false} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders dialog when open is true", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  test("renders with label 'Import content'", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(screen.getByRole("dialog", { name: /import content/i })).toBeDefined();
  });
});

// ── IngestDialog: source step ─────────────────────────────────────────────────

describe("IngestDialog — source step", () => {
  test("shows FileTextPromptSourcePicker in source step", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(screen.getByRole("tablist", { name: /source type/i })).toBeDefined();
  });

  test("Run button is disabled when no source is selected", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    const runBtn = screen.getByRole("button", { name: /^run$/i });
    expect((runBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("Run button is enabled when source is selected", async () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    await userEvent.type(screen.getByPlaceholderText(/paste source text/i), "source text");
    const runBtn = screen.getByRole("button", { name: /^run$/i });
    expect((runBtn as HTMLButtonElement).disabled).toBe(false);
  });

  test("Run button is disabled while flow is running", () => {
    const flow = makeFlow({ isRunning: true });
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    const runBtn = screen.getByRole("button", { name: /running/i });
    expect((runBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("shows Cancel button in source step", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });

  test("Cancel calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog
        open={true}
        onOpenChange={onOpenChange}
        presets={samplePresets}
        onRun={vi.fn()}
      />,
      flow,
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("Close button calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog
        open={true}
        onOpenChange={onOpenChange}
        presets={samplePresets}
        onRun={vi.fn()}
      />,
      flow,
    );
    await userEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("clicking overlay calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog
        open={true}
        onOpenChange={onOpenChange}
        presets={samplePresets}
        onRun={vi.fn()}
      />,
      flow,
    );
    const overlay = document.querySelector("[aria-hidden='true']") as HTMLElement;
    await userEvent.click(overlay);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ── IngestDialog: options ─────────────────────────────────────────────────────

describe("IngestDialog — options", () => {
  test("shows WritePolicyPicker in source step", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(screen.getByText(/write policy/i)).toBeDefined();
  });

  test("shows UserPromptField in source step", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(screen.getByLabelText(/custom instructions/i)).toBeDefined();
  });

  test("shows PresetPicker when presets are provided", () => {
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={vi.fn()} />,
      flow,
    );
    expect(screen.getByText(/^Preset$/i)).toBeDefined();
  });
});

// ── IngestDialog: Run calls onRun ────────────────────────────────────────────

describe("IngestDialog — run flow", () => {
  test("clicking Run calls onRun with selected source", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const flow = makeFlow();
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={onRun} />,
      flow,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    await userEvent.type(screen.getByPlaceholderText(/paste source text/i), "my source");
    await userEvent.click(screen.getByRole("button", { name: /^run$/i }));
    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "text", text: "my source" }),
    );
  });

  test("transitions to review step after onRun resolves", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const descriptionAccessor = makeAccessor(descriptionSuggestion);
    const flow = makeFlow({
      suggestions: new Map([["description", descriptionSuggestion]]),
      forField: vi.fn(() => descriptionAccessor),
    });
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={onRun} />,
      flow,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    await userEvent.type(screen.getByPlaceholderText(/paste source text/i), "my source");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^run$/i }));
    });
    // Review step: shows suggestions count
    expect(screen.getByText(/1 suggestion to review/i)).toBeDefined();
  });
});

// ── IngestDialog: review step ─────────────────────────────────────────────────

describe("IngestDialog — review step", () => {
  function renderAtReviewStep(
    flow: UseAiSuggestionsReturn,
    onApplyField?: (field: string, value: unknown) => void,
  ) {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const result = renderWithFlow(
      <IngestDialog
        open={true}
        onOpenChange={vi.fn()}
        presets={samplePresets}
        onRun={onRun}
        onApplyField={onApplyField}
      />,
      flow,
    );

    return { onRun, result };
  }

  async function advanceToReview(onRun: ReturnType<typeof vi.fn>) {
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    await userEvent.type(screen.getByPlaceholderText(/paste source text/i), "source");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^run$/i }));
    });
    expect(onRun).toHaveBeenCalled();
  }

  test("shows field names in review step", async () => {
    const descriptionAccessor = makeAccessor(descriptionSuggestion);
    const tagsAccessor = makeAccessor(tagsSuggestion);
    const flow = makeFlow({
      suggestions: new Map([
        ["description", descriptionSuggestion],
        ["tags", tagsSuggestion],
      ]),
      forField: vi.fn((field: string) => {
        if (field === "description") return descriptionAccessor;
        if (field === "tags") return tagsAccessor;
        return makeAccessor();
      }),
    });
    const { onRun } = renderAtReviewStep(flow);
    await advanceToReview(onRun);
    expect(screen.getByText("description")).toBeDefined();
    expect(screen.getByText("tags")).toBeDefined();
  });

  test("shows suggestion values in review step", async () => {
    const accessor = makeAccessor(descriptionSuggestion);
    const flow = makeFlow({
      suggestions: new Map([["description", descriptionSuggestion]]),
      forField: vi.fn(() => accessor),
    });
    const { onRun } = renderAtReviewStep(flow);
    await advanceToReview(onRun);
    expect(screen.getByText(String(descriptionSuggestion.value))).toBeDefined();
  });

  test("accept button calls recordAccept and onApplyField", async () => {
    const onApplyField = vi.fn();
    const accessor = makeAccessor(descriptionSuggestion);
    const flow = makeFlow({
      suggestions: new Map([["description", descriptionSuggestion]]),
      forField: vi.fn(() => accessor),
    });
    const { onRun } = renderAtReviewStep(flow, onApplyField);
    await advanceToReview(onRun);
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(accessor.recordAccept).toHaveBeenCalledWith(
      descriptionSuggestion.hash,
      descriptionSuggestion.value,
    );
    expect(onApplyField).toHaveBeenCalledWith("description", descriptionSuggestion.value);
  });

  test("reject button calls recordReject", async () => {
    const accessor = makeAccessor(descriptionSuggestion);
    const flow = makeFlow({
      suggestions: new Map([["description", descriptionSuggestion]]),
      forField: vi.fn(() => accessor),
    });
    const { onRun } = renderAtReviewStep(flow);
    await advanceToReview(onRun);
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(accessor.recordReject).toHaveBeenCalledWith(descriptionSuggestion.hash);
  });

  test("shows Done button in review step", async () => {
    const accessor = makeAccessor(descriptionSuggestion);
    const flow = makeFlow({
      suggestions: new Map([["description", descriptionSuggestion]]),
      forField: vi.fn(() => accessor),
    });
    const { onRun } = renderAtReviewStep(flow);
    await advanceToReview(onRun);
    expect(screen.getByRole("button", { name: /done/i })).toBeDefined();
  });

  test("Done button calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const accessor = makeAccessor(descriptionSuggestion);
    const flow = makeFlow({
      suggestions: new Map([["description", descriptionSuggestion]]),
      forField: vi.fn(() => accessor),
    });
    const onRun = vi.fn().mockResolvedValue(undefined);
    renderWithFlow(
      <IngestDialog
        open={true}
        onOpenChange={onOpenChange}
        presets={samplePresets}
        onRun={onRun}
      />,
      flow,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    await userEvent.type(screen.getByPlaceholderText(/paste source text/i), "source");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^run$/i }));
    });
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("shows empty state message when no suggestions", async () => {
    const flow = makeFlow({ suggestions: new Map() });
    const onRun = vi.fn().mockResolvedValue(undefined);
    renderWithFlow(
      <IngestDialog open={true} onOpenChange={vi.fn()} presets={samplePresets} onRun={onRun} />,
      flow,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Text" }));
    await userEvent.type(screen.getByPlaceholderText(/paste source text/i), "source");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^run$/i }));
    });
    expect(screen.getByText(/no suggestions to review/i)).toBeDefined();
  });
});
