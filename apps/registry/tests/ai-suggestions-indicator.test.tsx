// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

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
  test("renders Get AI suggestions button when idle", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByRole("button", { name: /get ai suggestions/i })).toBeVisible();
  });

  test("clicking Get AI suggestions calls flow.run", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /get ai suggestions/i }).click();
    expect(flow.run).toHaveBeenCalled();
  });
});

// ── AiSuggestionsIndicator: running state ────────────────────────────────────

describe("AiSuggestionsIndicator — running state", () => {
  test("renders Running text when isRunning is true", async () => {
    const flow = makeFlow({ isRunning: true });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/running/i)).toBeVisible();
  });

  test("does not render Get AI suggestions button when running", async () => {
    const flow = makeFlow({ isRunning: true });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect
      .element(screen.getByRole("button", { name: /get ai suggestions/i }))
      .not.toBeInTheDocument();
  });
});

// ── AiSuggestionsIndicator: has-suggestions state ────────────────────────────

describe("AiSuggestionsIndicator — has-suggestions state", () => {
  test("renders field count when suggestions exist", async () => {
    const flow = makeFlowWithSuggestions({ description: textSuggestion });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/1.*field|field.*1/i)).toBeVisible();
  });

  test("renders review-in-place text when only pending suggestions", async () => {
    const flow = makeFlowWithSuggestions({
      description: textSuggestion,
      title: { ...textSuggestion, hash: "xyz999" },
    });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/review in place/i)).toBeVisible();
  });

  test("renders to review counter", async () => {
    const flow = makeFlowWithSuggestions({
      description: textSuggestion,
      title: { ...textSuggestion, hash: "xyz999" },
      tags: { ...textSuggestion, hash: "zzz000" },
    });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/3.*to review|to review.*3/i)).toBeVisible();
  });
});

// ── AiSuggestionsIndicator: mixed state ─────────────────────────────────────

describe("AiSuggestionsIndicator — mixed state", () => {
  test("renders auto-applied count", async () => {
    const flow = makeFlowWithSuggestions(
      { description: textSuggestion },
      { title: autoAppliedEntry },
    );
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/1.*auto-applied|auto-applied.*1/i)).toBeVisible();
  });

  test("renders both auto-applied and to-review counters", async () => {
    const flow = makeFlowWithSuggestions(
      { description: textSuggestion, tags: { ...textSuggestion, hash: "other" } },
      { title: autoAppliedEntry, category: { ...autoAppliedEntry, hash: "cat1" } },
    );
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/2.*auto-applied|auto-applied.*2/i)).toBeVisible();
    await expect.element(screen.getByText(/2.*to review|to review.*2/i)).toBeVisible();
  });

  test("renders only auto-applied when no pending suggestions", async () => {
    const flow = makeFlowWithSuggestions(
      {},
      { title: autoAppliedEntry, category: { ...autoAppliedEntry, hash: "cat2" } },
    );
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/2.*auto-applied|auto-applied.*2/i)).toBeVisible();
    await expect.element(screen.getByText(/to review/i)).not.toBeInTheDocument();
  });
});

// ── AiSuggestionsIndicator: Options affordance ───────────────────────────────

describe("AiSuggestionsIndicator — Options affordance", () => {
  test("renders an Options button", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByRole("button", { name: /options/i })).toBeVisible();
  });
});

// ── SuggestionsOptions ────────────────────────────────────────────────────────

describe("SuggestionsOptions", () => {
  test("renders PresetPicker when presets are provided", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/^Preset$/i)).toBeVisible();
  });

  test("renders UserPromptField", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await expect.element(screen.getByLabelText(/custom instructions/i)).toBeVisible();
  });

  test("renders WritePolicyPicker", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await expect.element(screen.getByText(/write policy/i)).toBeVisible();
  });

  test("renders Run button", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await expect.element(screen.getByRole("button", { name: /run/i })).toBeVisible();
  });

  test("clicking Run calls flow.run", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /run/i }).click();
    expect(flow.run).toHaveBeenCalled();
  });

  test("Run button is disabled while running", async () => {
    const flow = makeFlow({ isRunning: true });
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await expect.element(screen.getByRole("button", { name: /run/i })).toBeDisabled();
  });

  test("preset change calls flow.setPreset", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await screen.getByRole("option", { name: /detailed/i }).click();
    expect(flow.setPreset).toHaveBeenCalledWith("detailed");
  });

  test("userPrompt change calls flow.setUserPrompt", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<SuggestionsOptions presets={samplePresets} />, flow);
    await screen.getByLabelText(/custom instructions/i).fill("be concise");
    expect(flow.setUserPrompt).toHaveBeenCalled();
  });
});

// ── Options button opens SuggestionsOptions inline ───────────────────────────

describe("AiSuggestionsIndicator — Options opens SuggestionsOptions", () => {
  test("SuggestionsOptions content is visible after clicking Options", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /options/i }).click();
    await expect.element(screen.getByRole("button", { name: /run/i })).toBeVisible();
  });

  test("SuggestionsOptions content is hidden before clicking Options", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByRole("button", { name: /run/i })).not.toBeInTheDocument();
  });
});

// ── AiSuggestionsIndicator: acceptAll button ──────────────────────────────────

describe("AiSuggestionsIndicator — Accept all button", () => {
  test("does not render Accept all when no pending suggestions", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect
      .element(screen.getByRole("button", { name: /accept all/i }))
      .not.toBeInTheDocument();
  });

  test("does not render Accept all when only auto-applied, no pending", async () => {
    const flow = makeFlowWithSuggestions({}, { title: autoAppliedEntry });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect
      .element(screen.getByRole("button", { name: /accept all/i }))
      .not.toBeInTheDocument();
  });

  test("renders Accept all button when pending suggestions exist", async () => {
    const flow = makeFlowWithSuggestions({ description: textSuggestion });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await expect.element(screen.getByRole("button", { name: /accept all/i })).toBeVisible();
  });

  test("clicking Accept all calls flow.acceptAll", async () => {
    const flow = makeFlowWithSuggestions({ description: textSuggestion });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /accept all/i }).click();
    expect(flow.acceptAll).toHaveBeenCalled();
  });

  test("no inline notice when acceptAll returns void (all fields viewed)", async () => {
    const flow = makeFlow({
      suggestions: new Map([["description", textSuggestion]]),
      acceptAll: vi.fn().mockReturnValue(undefined),
    });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /accept all/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /review remaining first/i }))
      .not.toBeInTheDocument();
  });

  test("inline notice appears when acceptAll returns requiresReview fields", async () => {
    const flow = makeFlow({
      suggestions: new Map([
        ["description", textSuggestion],
        ["title", { ...textSuggestion, hash: "yyy" }],
      ]),
      acceptAll: vi.fn().mockReturnValue({ requiresReview: ["description", "title"] }),
    });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /accept all/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /review remaining first/i }))
      .toBeVisible();
  });

  test("inline notice lists unviewed field labels", async () => {
    const flow = makeFlow({
      suggestions: new Map([["myField", textSuggestion]]),
      acceptAll: vi.fn().mockReturnValue({ requiresReview: ["myField"] }),
    });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /accept all/i }).click();
    await expect.element(screen.getByText(/my field/i)).toBeVisible();
  });

  test("clicking Review remaining first CTA dismisses the notice", async () => {
    const flow = makeFlow({
      suggestions: new Map([["description", textSuggestion]]),
      acceptAll: vi.fn().mockReturnValue({ requiresReview: ["description"] }),
    });
    const screen = await renderWithFlow(<AiSuggestionsIndicator presets={samplePresets} />, flow);
    await screen.getByRole("button", { name: /accept all/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /review remaining first/i }))
      .toBeVisible();
    await screen.getByRole("button", { name: /review remaining first/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /review remaining first/i }))
      .not.toBeInTheDocument();
  });
});
