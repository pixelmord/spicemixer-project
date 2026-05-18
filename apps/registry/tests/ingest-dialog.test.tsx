// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  FileTextPromptSourcePicker,
  type SourceShape,
} from "../src/components/file-text-prompt-source-picker";
import { IngestDialog } from "../src/components/ingest-dialog";
import type {
  UseAiSuggestionsReturn,
  AiPreset,
  PerFieldAccessor,
  FieldSuggestion,
} from "../src/components/use-ai-suggestions";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

const samplePresets: AiPreset[] = [
  { id: "default", label: "Default" },
  { id: "detailed", label: "Detailed" },
];

// ── FileTextPromptSourcePicker ────────────────────────────────────────────────

describe("FileTextPromptSourcePicker — tab rendering", () => {
  test("renders three source tabs", () => {
    render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /from file/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /from text/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /from prompt/i })).toBeDefined();
  });

  test("shows file input by default (first tab active)", () => {
    render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    expect(screen.getByText(/upload file/i)).toBeDefined();
  });
});

describe("FileTextPromptSourcePicker — text source", () => {
  test("switching to From text tab shows textarea", async () => {
    render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  test("typing in text tab emits { kind: text, content } shape", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "hello world");
    const lastCall = onChange.mock.calls.at(-1)?.[0] as SourceShape | null;
    expect(lastCall).not.toBeNull();
    expect(lastCall?.kind).toBe("text");
    if (lastCall?.kind === "text") {
      expect(lastCall.content).toContain("hello");
    }
  });

  test("clearing text tab emits null", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "something");
    await userEvent.clear(textarea);
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeNull();
  });
});

describe("FileTextPromptSourcePicker — prompt source", () => {
  test("switching to From prompt tab shows textarea", async () => {
    render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /from prompt/i }));
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  test("typing in prompt tab emits { kind: prompt, prompt } shape", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /from prompt/i }));
    await userEvent.type(screen.getByRole("textbox"), "quick vegan curry");
    const lastCall = onChange.mock.calls.at(-1)?.[0] as SourceShape | null;
    expect(lastCall).not.toBeNull();
    expect(lastCall?.kind).toBe("prompt");
    if (lastCall?.kind === "prompt") {
      expect(lastCall.prompt).toContain("curry");
    }
  });
});

describe("FileTextPromptSourcePicker — tab switching clears source", () => {
  test("switching tabs emits null", async () => {
    const onChange = vi.fn();
    render(<FileTextPromptSourcePicker onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "some text");
    onChange.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /from prompt/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

// ── IngestDialog — rendering ──────────────────────────────────────────────────

describe("IngestDialog — source phase rendering", () => {
  test("renders dialog title when open", () => {
    render(<IngestDialog open onOpenChange={vi.fn()} title="Test ingest" onRun={vi.fn()} />);
    expect(screen.getByText(/test ingest/i)).toBeDefined();
  });

  test("renders source picker tabs", () => {
    render(<IngestDialog open onOpenChange={vi.fn()} onRun={vi.fn()} />);
    expect(screen.getByRole("button", { name: /from file/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /from text/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /from prompt/i })).toBeDefined();
  });

  test("renders Generate button", () => {
    render(<IngestDialog open onOpenChange={vi.fn()} onRun={vi.fn()} />);
    expect(screen.getByRole("button", { name: /generate/i })).toBeDefined();
  });

  test("Generate button is disabled when no source selected", () => {
    render(<IngestDialog open onOpenChange={vi.fn()} onRun={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /generate/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test("Generate button becomes enabled after selecting text source", async () => {
    render(<IngestDialog open onOpenChange={vi.fn()} onRun={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "some content here");
    const btn = screen.getByRole("button", { name: /generate/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  test("uses custom generateLabel prop", () => {
    render(
      <IngestDialog open onOpenChange={vi.fn()} onRun={vi.fn()} generateLabel="Create recipe" />,
    );
    expect(screen.getByRole("button", { name: /create recipe/i })).toBeDefined();
  });
});

describe("IngestDialog — SuggestionsOptions integration", () => {
  test("shows options when flow and presets provided", async () => {
    const flow = makeFlow();
    render(
      <IngestDialog
        open
        onOpenChange={vi.fn()}
        onRun={vi.fn()}
        flow={flow}
        presets={samplePresets}
      />,
    );
    expect(screen.getByText(/^Preset$/i)).toBeDefined();
  });

  test("SuggestionsOptions Run button is not shown (only Generate button)", () => {
    const flow = makeFlow();
    render(
      <IngestDialog
        open
        onOpenChange={vi.fn()}
        onRun={vi.fn()}
        flow={flow}
        presets={samplePresets}
      />,
    );
    // Only one run-type button: Generate
    const runButtons = screen.queryAllByRole("button", { name: /^run$/i });
    expect(runButtons.length).toBe(0);
    expect(screen.getByRole("button", { name: /generate/i })).toBeDefined();
  });

  test("does not show SuggestionsOptions when no flow provided", () => {
    render(<IngestDialog open onOpenChange={vi.fn()} onRun={vi.fn()} presets={samplePresets} />);
    expect(screen.queryByText(/^Preset$/i)).toBeNull();
  });
});

// ── IngestDialog — generate flow ──────────────────────────────────────────────

describe("IngestDialog — generate button calls onRun with source", () => {
  test("calls onRun with text source when Generate is clicked", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<IngestDialog open onOpenChange={vi.fn()} onRun={onRun} />);
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "pasta recipe");
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(onRun).toHaveBeenCalledOnce());
    const [source] = onRun.mock.calls[0] as [SourceShape];
    expect(source.kind).toBe("text");
    if (source.kind === "text") {
      expect(source.content).toContain("pasta");
    }
  });

  test("calls onRun with prompt source shape", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<IngestDialog open onOpenChange={vi.fn()} onRun={onRun} />);
    await userEvent.click(screen.getByRole("button", { name: /from prompt/i }));
    await userEvent.type(screen.getByRole("textbox"), "quick Thai curry");
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(onRun).toHaveBeenCalledOnce());
    const [source] = onRun.mock.calls[0] as [SourceShape];
    expect(source.kind).toBe("prompt");
    if (source.kind === "prompt") {
      expect(source.prompt).toContain("curry");
    }
  });
});

// ── IngestDialog — phase transitions ──────────────────────────────────────────

describe("IngestDialog — review phase", () => {
  test("transitions to review phase after onRun resolves when reviewChildren provided", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(
      <IngestDialog
        open
        onOpenChange={vi.fn()}
        onRun={onRun}
        reviewChildren={<div data-testid="review-body">Review content</div>}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "content here");
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => screen.getByTestId("review-body"));
    expect(screen.getByText("Review content")).toBeDefined();
  });

  test("shows Try different source back button in review phase", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(
      <IngestDialog open onOpenChange={vi.fn()} onRun={onRun} reviewChildren={<div>Review</div>} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "content");
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => screen.getByText(/try different source/i));
    expect(screen.getByText(/try different source/i)).toBeDefined();
  });

  test("clicking back returns to source phase", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(
      <IngestDialog open onOpenChange={vi.fn()} onRun={onRun} reviewChildren={<div>Review</div>} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "content");
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => screen.getByText(/try different source/i));
    await userEvent.click(screen.getByText(/try different source/i));
    // Source picker should be visible again
    expect(screen.getByRole("button", { name: /from file/i })).toBeDefined();
  });

  test("closes dialog instead of entering review phase when no reviewChildren", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<IngestDialog open onOpenChange={onOpenChange} onRun={onRun} />);
    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "content");
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

// ── IngestDialog — end-to-end ingest flow ─────────────────────────────────────

describe("IngestDialog — end-to-end ingest (prompt source)", () => {
  test("full ingest: select prompt source → generate → view review body", async () => {
    const receivedSources: SourceShape[] = [];
    const onRun = vi.fn().mockImplementation(async (source: SourceShape) => {
      receivedSources.push(source);
    });

    render(
      <IngestDialog
        open
        onOpenChange={vi.fn()}
        title="Enhance recipe"
        onRun={onRun}
        reviewChildren={<div data-testid="suggestions">3 suggestions</div>}
      />,
    );

    // Step 1: switch to prompt tab
    await userEvent.click(screen.getByRole("button", { name: /from prompt/i }));

    // Step 2: enter prompt
    await userEvent.type(screen.getByRole("textbox"), "spicy vegetarian ramen");

    // Step 3: click Generate
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    // Step 4: review phase renders
    await waitFor(() => screen.getByTestId("suggestions"));
    expect(screen.getByText("3 suggestions")).toBeDefined();

    // Step 5: source was passed correctly
    expect(receivedSources).toHaveLength(1);
    expect(receivedSources[0].kind).toBe("prompt");
  });

  test("full ingest: select text source → generate → view review body", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);

    render(
      <IngestDialog
        open
        onOpenChange={vi.fn()}
        title="Enhance ingredient"
        onRun={onRun}
        reviewChildren={<div data-testid="review">Review here</div>}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    await userEvent.type(screen.getByRole("textbox"), "# Cardamom\n\nAromatic spice from India.");
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => screen.getByTestId("review"));
    const [source] = onRun.mock.calls[0] as [SourceShape];
    expect(source.kind).toBe("text");
  });
});
