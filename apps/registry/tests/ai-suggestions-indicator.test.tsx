// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { AiSuggestionsIndicator } from "../src/components/ai-suggestions-indicator";
import { SuggestionsOptions } from "../src/components/suggestions-options";
import { SuggestionFlowProvider } from "../src/components/suggestion-flow-provider";
import type {
  UseAiSuggestionsReturn,
  PerFieldAccessor,
  FieldSuggestion,
  AppliedSuggestion,
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

function makeFlowWithSuggestions(
  fieldSuggestions: Record<string, FieldSuggestion>,
  autoAppliedFields: Record<string, AppliedSuggestion> = {},
): UseAiSuggestionsReturn {
  return makeFlow({
    suggestions: new Map(Object.entries(fieldSuggestions)),
    autoApplied: new Map(Object.entries(autoAppliedFields)),
  });
}

function renderWithFlow(ui: React.ReactNode, flow: UseAiSuggestionsReturn) {
  return render(<SuggestionFlowProvider value={flow}>{ui}</SuggestionFlowProvider>);
}

const textSuggestion: FieldSuggestion = {
  kind: "single",
  value: "Rich cardamom cake",
  confidence: "high",
  summary: "Enhanced",
  hash: "abc123",
  traceId: "trace-1",
};

const autoAppliedEntry: AppliedSuggestion = {
  value: "Spiced dessert",
  hash: "def456",
  summary: "Auto-applied description",
  confidence: "medium",
};

// ── AiSuggestionsIndicator: idle state ───────────────────────────────────────

describe("AiSuggestionsIndicator — idle state", () => {
  test("renders Get AI suggestions button when idle", () => {
    const flow = makeFlow();
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByRole("button", { name: /get ai suggestions/i })).toBeDefined();
  });

  test("clicking Get AI suggestions calls flow.run", async () => {
    const flow = makeFlow();
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await userEvent.click(screen.getByRole("button", { name: /get ai suggestions/i }));
    expect(flow.run).toHaveBeenCalled();
  });
});

// ── AiSuggestionsIndicator: running state ────────────────────────────────────

describe("AiSuggestionsIndicator — running state", () => {
  test("renders Running text when isRunning is true", () => {
    const flow = makeFlow({ isRunning: true });
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByText(/running/i)).toBeDefined();
  });

  test("does not render Get AI suggestions button when running", () => {
    const flow = makeFlow({ isRunning: true });
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.queryByRole("button", { name: /get ai suggestions/i })).toBeNull();
  });
});

// ── AiSuggestionsIndicator: has-suggestions state ────────────────────────────

describe("AiSuggestionsIndicator — has-suggestions state", () => {
  test("renders field count when suggestions exist", () => {
    const flow = makeFlowWithSuggestions({ description: textSuggestion });
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByText(/1.*field|field.*1/i)).toBeDefined();
  });

  test("renders review-in-place text when only pending suggestions", () => {
    const flow = makeFlowWithSuggestions({
      description: textSuggestion,
      title: { ...textSuggestion, hash: "xyz999" },
    });
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByText(/review in place/i)).toBeDefined();
  });

  test("renders to review counter", () => {
    const flow = makeFlowWithSuggestions({
      description: textSuggestion,
      title: { ...textSuggestion, hash: "xyz999" },
      tags: { ...textSuggestion, hash: "zzz000" },
    });
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByText(/3.*to review|to review.*3/i)).toBeDefined();
  });
});

// ── AiSuggestionsIndicator: mixed state (auto-applied + to-review) ───────────

describe("AiSuggestionsIndicator — mixed state", () => {
  test("renders auto-applied count", () => {
    const flow = makeFlowWithSuggestions(
      { description: textSuggestion },
      { title: autoAppliedEntry },
    );
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByText(/1.*auto-applied|auto-applied.*1/i)).toBeDefined();
  });

  test("renders both auto-applied and to-review counters", () => {
    const flow = makeFlowWithSuggestions(
      { description: textSuggestion, tags: { ...textSuggestion, hash: "other" } },
      { title: autoAppliedEntry, category: { ...autoAppliedEntry, hash: "cat1" } },
    );
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByText(/2.*auto-applied|auto-applied.*2/i)).toBeDefined();
    expect(screen.getByText(/2.*to review|to review.*2/i)).toBeDefined();
  });

  test("renders only auto-applied when no pending suggestions", () => {
    const flow = makeFlowWithSuggestions(
      {},
      { title: autoAppliedEntry, category: { ...autoAppliedEntry, hash: "cat2" } },
    );
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByText(/2.*auto-applied|auto-applied.*2/i)).toBeDefined();
    expect(screen.queryByText(/to review/i)).toBeNull();
  });
});

// ── AiSuggestionsIndicator: Options affordance ───────────────────────────────

describe("AiSuggestionsIndicator — Options affordance", () => {
  test("renders an Options button", () => {
    const flow = makeFlow();
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.getByRole("button", { name: /options/i })).toBeDefined();
  });
});

// ── SuggestionsOptions ────────────────────────────────────────────────────────

describe("SuggestionsOptions", () => {
  test("renders PresetPicker when presets are provided", () => {
    const flow = makeFlow();
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    expect(screen.getByText(/^Preset$/i)).toBeDefined();
  });

  test("renders UserPromptField", () => {
    const flow = makeFlow();
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    expect(screen.getByLabelText(/custom instructions/i)).toBeDefined();
  });

  test("renders WritePolicyPicker", () => {
    const flow = makeFlow();
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    expect(screen.getByText(/write policy/i)).toBeDefined();
  });

  test("renders Run button", () => {
    const flow = makeFlow();
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    expect(screen.getByRole("button", { name: /run/i })).toBeDefined();
  });

  test("clicking Run calls flow.run", async () => {
    const flow = makeFlow();
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await userEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(flow.run).toHaveBeenCalled();
  });

  test("Run button is disabled while running", () => {
    const flow = makeFlow({ isRunning: true });
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    const btn = screen.getByRole("button", { name: /run/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  test("preset change calls flow.setPreset", async () => {
    const flow = makeFlow();
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    const option = screen.getByRole("option", { name: /detailed/i });
    await userEvent.click(option);
    expect(flow.setPreset).toHaveBeenCalledWith("detailed");
  });

  test("userPrompt change calls flow.setUserPrompt", async () => {
    const flow = makeFlow();
    renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    const textarea = screen.getByLabelText(/custom instructions/i);
    await userEvent.type(textarea, "be concise");
    expect(flow.setUserPrompt).toHaveBeenCalled();
  });
});

// ── Options button opens SuggestionsOptions inline ───────────────────────────

describe("AiSuggestionsIndicator — Options opens SuggestionsOptions", () => {
  test("SuggestionsOptions content is visible after clicking Options", async () => {
    const flow = makeFlow();
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    const optionsBtn = screen.getByRole("button", { name: /options/i });
    await userEvent.click(optionsBtn);
    expect(screen.getByRole("button", { name: /run/i })).toBeDefined();
  });

  test("SuggestionsOptions content is hidden before clicking Options", () => {
    const flow = makeFlow();
    renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    expect(screen.queryByRole("button", { name: /run/i })).toBeNull();
  });
});
