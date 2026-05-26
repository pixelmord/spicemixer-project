// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vite-plus/test";

import { AiBulkSuggestButton } from "../src/components/ai-bulk-suggest-button";
import { AiBulkTranslateButton } from "../src/components/ai-bulk-translate-button";
import { AiFieldSuggestButton } from "../src/components/ai-field-suggest-button";
import { AiFieldTranslateButton } from "../src/components/ai-field-translate-button";
import { SuggestionFlowProvider } from "../src/components/suggestion-flow-provider";
import type {
  UseAiSuggestionsReturn,
  PerFieldAccessor,
  FieldSuggestion,
  AiContract,
} from "../src/components/use-ai-suggestions";

const LS_KEY = "spicemixer.bulkTranslateWritePolicy";

afterEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
});

// ── Shared helpers ─────────────────────────────────────────────────────────────

function makeAccessor(overrides: Partial<PerFieldAccessor> = {}): PerFieldAccessor {
  return {
    suggestion: undefined,
    autoApplied: undefined,
    trace: undefined,
    recordAccept: vi.fn(),
    recordReject: vi.fn(),
    revertAutoApply: vi.fn(),
    markViewed: vi.fn(),
    source: undefined,
    sourceLocale: "en",
    isStale: false,
    translationMode: "translate",
    retranslate: vi.fn(),
    isRunning: false,
    run: vi.fn(),
    ...overrides,
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
    runTranslation: vi.fn(),
    ...overrides,
  };
}

const textSuggestion: FieldSuggestion = {
  kind: "single",
  value: "Aromatic basil",
  confidence: "medium",
  summary: "Translation",
  hash: "abc123",
  traceId: "trace-1",
};

function renderWithFlow(ui: React.ReactNode, flow: UseAiSuggestionsReturn) {
  return render(<SuggestionFlowProvider value={flow}>{ui}</SuggestionFlowProvider>);
}

const testContract: AiContract = {
  presets: [],
  fields: {
    name: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    slug: { translation: { mode: "copy" } },
    internalNote: { translation: { mode: "skip" } },
  },
};

// ── AiBulkSuggestButton ────────────────────────────────────────────────────────

describe("AiBulkSuggestButton — idle state", () => {
  test("renders Get AI suggestions button when idle with no suggestions", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiBulkSuggestButton />, flow);
    await expect.element(screen.getByRole("button", { name: /get ai suggestions/i })).toBeVisible();
  });

  test("clicking Get AI suggestions calls flow.run()", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiBulkSuggestButton />, flow);
    await screen.getByRole("button", { name: /get ai suggestions/i }).click();
    expect(flow.run).toHaveBeenCalledOnce();
  });
});

describe("AiBulkSuggestButton — running state", () => {
  test("shows spinner when isRunning is true", async () => {
    const flow = makeFlow({ isRunning: true });
    const screen = await renderWithFlow(<AiBulkSuggestButton />, flow);
    await expect.element(screen.getByRole("button")).toBeDisabled();
  });

  test("does not show Get AI suggestions when running", async () => {
    const flow = makeFlow({ isRunning: true });
    const screen = await renderWithFlow(<AiBulkSuggestButton />, flow);
    await expect.element(screen.getByText(/get ai suggestions/i)).not.toBeInTheDocument();
  });
});

describe("AiBulkSuggestButton — has-pending state", () => {
  test("shows Accept all (N) button when suggestions exist", async () => {
    const flow = makeFlow({
      suggestions: new Map([["name", textSuggestion]]),
    });
    const screen = await renderWithFlow(<AiBulkSuggestButton />, flow);
    await expect.element(screen.getByRole("button", { name: /accept all/i })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /accept all \(1\)/i })).toBeVisible();
  });

  test("clicking Accept all calls flow.acceptAll()", async () => {
    const flow = makeFlow({
      suggestions: new Map([["name", textSuggestion]]),
    });
    const screen = await renderWithFlow(<AiBulkSuggestButton />, flow);
    await screen.getByRole("button", { name: /accept all/i }).click();
    expect(flow.acceptAll).toHaveBeenCalledOnce();
  });
});

// ── AiBulkTranslateButton ──────────────────────────────────────────────────────

describe("AiBulkTranslateButton — fill-gaps (default)", () => {
  test("shows Translate missing fields button by default", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiBulkTranslateButton contract={testContract} />, flow);
    await expect
      .element(screen.getByRole("button", { name: /translate missing fields/i }))
      .toBeVisible();
  });

  test("clicking primary button calls flow.runTranslation with only empty fields", async () => {
    const flow = makeFlow();
    const currentData = { name: "Basil" };
    const screen = await renderWithFlow(
      <AiBulkTranslateButton contract={testContract} currentData={currentData} />,
      flow,
    );
    await screen.getByRole("button", { name: /translate missing fields/i }).click();
    expect(flow.runTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.arrayContaining(["description"]) }),
    );
    // name already has value, should not be in target
    const call = flow.runTranslation.mock.calls[0][0];
    expect(call.target).not.toContain("name");
  });

  test("fill-gaps with all translatable fields filled: button is disabled so runTranslation is never called", async () => {
    const flow = makeFlow();
    // testContract has name + description as translatable; both are provided
    const currentData = { name: "Basil", description: "A fragrant herb" };
    const screen = await renderWithFlow(
      <AiBulkTranslateButton contract={testContract} currentData={currentData} />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /translate missing fields/i }))
      .toBeDisabled();
    expect(flow.runTranslation).not.toHaveBeenCalled();
  });

  test("primary button is disabled when all translatable fields are filled (fill-gaps)", async () => {
    const flow = makeFlow();
    const currentData = { name: "Basil", description: "A fragrant herb" };
    const screen = await renderWithFlow(
      <AiBulkTranslateButton contract={testContract} currentData={currentData} />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /translate missing fields/i }))
      .toBeDisabled();
  });

  test("primary button has tooltip explaining why it is disabled", async () => {
    const flow = makeFlow();
    const currentData = { name: "Basil", description: "A fragrant herb" };
    const screen = await renderWithFlow(
      <AiBulkTranslateButton contract={testContract} currentData={currentData} />,
      flow,
    );
    await expect
      .element(screen.getByRole("button", { name: /translate missing fields/i }))
      .toHaveAttribute("title", "All translatable fields already have content");
  });

  test("chevron dropdown still works when primary button is disabled", async () => {
    const flow = makeFlow();
    const currentData = { name: "Basil", description: "A fragrant herb" };
    const screen = await renderWithFlow(
      <AiBulkTranslateButton contract={testContract} currentData={currentData} />,
      flow,
    );
    await screen.getByRole("button", { name: /translation options/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /re-translate all fields/i }))
      .toBeVisible();
  });
});

describe("AiBulkTranslateButton — replace-all policy", () => {
  beforeEach(() => {
    try {
      localStorage.setItem(LS_KEY, "replace-all");
    } catch {}
  });

  test("shows Re-translate all fields button when policy is replace-all", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiBulkTranslateButton contract={testContract} />, flow);
    await expect
      .element(screen.getByRole("button", { name: /re-translate all fields/i }))
      .toBeVisible();
  });

  test("replace-all calls runTranslation with all translatable fields", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(
      <AiBulkTranslateButton contract={testContract} currentData={{ name: "Basil" }} />,
      flow,
    );
    await screen.getByRole("button", { name: /re-translate all fields/i }).click();
    const call = flow.runTranslation.mock.calls[0][0];
    // both name and description are translatable (not skip/copy)
    expect(call.target).toContain("name");
    expect(call.target).toContain("description");
    // slug (copy) and internalNote (skip) should not be included
    expect(call.target).not.toContain("slug");
    expect(call.target).not.toContain("internalNote");
  });
});

describe("AiBulkTranslateButton — running state", () => {
  test("shows disabled Translating button when isRunning", async () => {
    const flow = makeFlow({ isRunning: true });
    const screen = await renderWithFlow(<AiBulkTranslateButton contract={testContract} />, flow);
    await expect.element(screen.getByRole("button")).toBeDisabled();
    await expect.element(screen.getByText(/translating/i)).toBeVisible();
  });
});

describe("AiBulkTranslateButton — has-pending state", () => {
  test("shows Apply all (N) when suggestions pending", async () => {
    const flow = makeFlow({ suggestions: new Map([["name", textSuggestion]]) });
    const screen = await renderWithFlow(<AiBulkTranslateButton contract={testContract} />, flow);
    await expect.element(screen.getByRole("button", { name: /apply all \(1\)/i })).toBeVisible();
  });
});

describe("AiBulkTranslateButton — policy persistence", () => {
  test("policy is persisted to localStorage when changed via dropdown", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiBulkTranslateButton contract={testContract} />, flow);
    // Open dropdown
    await screen.getByRole("button", { name: /translation options/i }).click();
    // Select replace-all
    await screen.getByRole("button", { name: /re-translate all fields/i }).click();
    expect(localStorage.getItem(LS_KEY)).toBe("replace-all");
  });
});

// ── AiFieldSuggestButton ───────────────────────────────────────────────────────

describe("AiFieldSuggestButton — primary action", () => {
  test("renders AI suggest button", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiFieldSuggestButton fieldPath="name" />, flow);
    await expect.element(screen.getByRole("button", { name: /ai suggest/i })).toBeVisible();
  });

  test("clicking AI suggest calls accessor.run()", async () => {
    const accessor = makeAccessor();
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldSuggestButton fieldPath="name" />, flow);
    await screen.getByRole("button", { name: /ai suggest/i }).click();
    expect(accessor.run).toHaveBeenCalledOnce();
  });
});

describe("AiFieldSuggestButton — running state", () => {
  test("button is disabled when accessor.isRunning is true", async () => {
    const accessor = makeAccessor({ isRunning: true });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldSuggestButton fieldPath="name" />, flow);
    await expect.element(screen.getByRole("button")).toBeDisabled();
  });
});

describe("AiFieldSuggestButton — custom prompt dropdown", () => {
  test("opens dropdown on chevron click", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiFieldSuggestButton fieldPath="name" />, flow);
    await screen.getByRole("button", { name: /custom prompt options/i }).click();
    await expect.element(screen.getByRole("button", { name: /submit/i })).toBeVisible();
  });

  test("textarea resets when dropdown closes via Cancel", async () => {
    const flow = makeFlow();
    const screen = await renderWithFlow(<AiFieldSuggestButton fieldPath="name" />, flow);
    await screen.getByRole("button", { name: /custom prompt options/i }).click();
    const textarea = screen.getByRole("textbox");
    await textarea.fill("Custom instructions here");
    await screen.getByRole("button", { name: /cancel/i }).click();
    // Dropdown should close; reopening should show empty textarea
    await screen.getByRole("button", { name: /custom prompt options/i }).click();
    await expect.element(screen.getByRole("textbox")).toHaveValue("");
  });

  test("Submit calls accessor.run() after setting userPrompt", async () => {
    const accessor = makeAccessor();
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldSuggestButton fieldPath="name" />, flow);
    await screen.getByRole("button", { name: /custom prompt options/i }).click();
    await screen.getByRole("textbox").fill("Use formal tone");
    await screen.getByRole("button", { name: /submit/i }).click();
    expect(flow.setUserPrompt).toHaveBeenCalledWith("Use formal tone");
    expect(accessor.run).toHaveBeenCalledOnce();
  });
});

// ── AiFieldTranslateButton ─────────────────────────────────────────────────────

describe("AiFieldTranslateButton — translate mode", () => {
  test("renders Translate from <sibling> for translate mode", async () => {
    const accessor = makeAccessor({ translationMode: "translate", sourceLocale: "en" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="name" />, flow);
    await expect.element(screen.getByRole("button", { name: /translate from en/i })).toBeVisible();
  });

  test("clicking primary button calls accessor.retranslate() without merge", async () => {
    const accessor = makeAccessor({ translationMode: "translate" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="name" />, flow);
    await screen.getByRole("button", { name: /translate from/i }).click();
    expect(accessor.retranslate).toHaveBeenCalledWith(undefined);
  });
});

describe("AiFieldTranslateButton — localize mode", () => {
  test("renders Translate from <sibling> for localize mode", async () => {
    const accessor = makeAccessor({ translationMode: "localize", sourceLocale: "en" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="tags" />, flow);
    await expect.element(screen.getByRole("button", { name: /translate from en/i })).toBeVisible();
  });
});

describe("AiFieldTranslateButton — copy mode", () => {
  test("renders Copy from <sibling> for copy mode", async () => {
    const accessor = makeAccessor({ translationMode: "copy", sourceLocale: "en" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="slug" />, flow);
    await expect.element(screen.getByRole("button", { name: /copy from en/i })).toBeVisible();
  });

  test("no merge dropdown for copy mode", async () => {
    const accessor = makeAccessor({ translationMode: "copy", sourceLocale: "en" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="slug" />, flow);
    // The chevron / merge dropdown button should NOT be rendered in copy mode
    await expect
      .element(screen.getByRole("button", { name: /merge options/i }))
      .not.toBeInTheDocument();
  });
});

describe("AiFieldTranslateButton — skip mode", () => {
  test("renders nothing for skip mode", async () => {
    const accessor = makeAccessor({ translationMode: "skip" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const { container } = await renderWithFlow(
      <AiFieldTranslateButton fieldPath="internalNote" />,
      flow,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("AiFieldTranslateButton — merge option", () => {
  test("shows Merge with existing checkbox in translate mode dropdown", async () => {
    const accessor = makeAccessor({ translationMode: "translate", sourceLocale: "en" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="name" />, flow);
    await screen.getByRole("button", { name: /merge options/i }).click();
    await expect
      .element(screen.getByRole("checkbox", { name: /merge with existing/i }))
      .toBeVisible();
  });

  test("clicking merge checkbox + primary calls retranslate({ merge: true })", async () => {
    const accessor = makeAccessor({ translationMode: "translate", sourceLocale: "en" });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="name" />, flow);
    // Open merge dropdown and check the checkbox
    await screen.getByRole("button", { name: /merge options/i }).click();
    await screen.getByRole("checkbox", { name: /merge with existing/i }).click();
    // Now click the primary button
    await screen.getByRole("button", { name: /translate from/i }).click();
    expect(accessor.retranslate).toHaveBeenCalledWith({ merge: true });
  });
});

describe("AiFieldTranslateButton — running state", () => {
  test("button is disabled when accessor.isRunning is true", async () => {
    const accessor = makeAccessor({ translationMode: "translate", isRunning: true });
    const flow = makeFlow({ forField: vi.fn().mockReturnValue(accessor) });
    const screen = await renderWithFlow(<AiFieldTranslateButton fieldPath="name" />, flow);
    await expect.element(screen.getByRole("button")).toBeDisabled();
  });
});
