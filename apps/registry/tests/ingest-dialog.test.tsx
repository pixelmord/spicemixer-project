// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

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
  test("renders three source tabs", async () => {
    const screen = await render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    await expect.element(screen.getByRole("button", { name: /from file/i })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /from text/i })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /from prompt/i })).toBeVisible();
  });

  test("shows file input by default (first tab active)", async () => {
    const screen = await render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    await expect.element(screen.getByText(/upload file/i)).toBeVisible();
  });
});

describe("FileTextPromptSourcePicker — text source", () => {
  test("switching to From text tab shows textarea", async () => {
    const screen = await render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    await screen.getByRole("button", { name: /from text/i }).click();
    await expect.element(screen.getByRole("textbox")).toBeVisible();
  });

  test("typing in text tab emits { kind: text, content } shape", async () => {
    const onChange = vi.fn();
    const screen = await render(<FileTextPromptSourcePicker onChange={onChange} />);
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("hello world");
    const lastCall = onChange.mock.calls.at(-1)?.[0] as SourceShape | null;
    expect(lastCall).not.toBeNull();
    expect(lastCall?.kind).toBe("text");
    if (lastCall?.kind === "text") {
      expect(lastCall.content).toContain("hello");
    }
  });

  test("clearing text tab emits null", async () => {
    const onChange = vi.fn();
    const screen = await render(<FileTextPromptSourcePicker onChange={onChange} />);
    await screen.getByRole("button", { name: /from text/i }).click();
    const textarea = screen.getByRole("textbox");
    await textarea.fill("something");
    await textarea.clear();
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeNull();
  });
});

describe("FileTextPromptSourcePicker — prompt source", () => {
  test("switching to From prompt tab shows textarea", async () => {
    const screen = await render(<FileTextPromptSourcePicker onChange={vi.fn()} />);
    await screen.getByRole("button", { name: /from prompt/i }).click();
    await expect.element(screen.getByRole("textbox")).toBeVisible();
  });

  test("typing in prompt tab emits { kind: prompt, prompt } shape", async () => {
    const onChange = vi.fn();
    const screen = await render(<FileTextPromptSourcePicker onChange={onChange} />);
    await screen.getByRole("button", { name: /from prompt/i }).click();
    await screen.getByRole("textbox").fill("quick vegan curry");
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
    const screen = await render(<FileTextPromptSourcePicker onChange={onChange} />);
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("some text");
    onChange.mockClear();
    await screen.getByRole("button", { name: /from prompt/i }).click();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

// ── IngestDialog — rendering ──────────────────────────────────────────────────

describe("IngestDialog — source phase rendering", () => {
  test("renders dialog title when open", async () => {
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        title="Test ingest"
        onRun={vi.fn()}
      />,
    );
    await expect.element(screen.getByText(/test ingest/i)).toBeVisible();
  });

  test("renders source picker tabs", async () => {
    const screen = await render(
      <IngestDialog modal={false} open onOpenChange={vi.fn()} onRun={vi.fn()} />,
    );
    await expect.element(screen.getByRole("button", { name: /from file/i })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /from text/i })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /from prompt/i })).toBeVisible();
  });

  test("renders Generate button", async () => {
    const screen = await render(
      <IngestDialog modal={false} open onOpenChange={vi.fn()} onRun={vi.fn()} />,
    );
    await expect.element(screen.getByRole("button", { name: /generate/i })).toBeVisible();
  });

  test("Generate button is disabled when no source selected", async () => {
    const screen = await render(
      <IngestDialog modal={false} open onOpenChange={vi.fn()} onRun={vi.fn()} />,
    );
    await expect.element(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
  });

  test("Generate button becomes enabled after selecting text source", async () => {
    const screen = await render(
      <IngestDialog modal={false} open onOpenChange={vi.fn()} onRun={vi.fn()} />,
    );
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("some content here");
    await expect.element(screen.getByRole("button", { name: /generate/i })).toBeEnabled();
  });

  test("uses custom generateLabel prop", async () => {
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        onRun={vi.fn()}
        generateLabel="Create recipe"
      />,
    );
    await expect.element(screen.getByRole("button", { name: /create recipe/i })).toBeVisible();
  });
});

describe("IngestDialog — SuggestionsOptions integration", () => {
  test("shows options when flow and presets provided", async () => {
    const flow = makeFlow();
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        onRun={vi.fn()}
        flow={flow}
        presets={samplePresets}
      />,
    );
    await expect.element(screen.getByText(/^Preset$/i)).toBeVisible();
  });

  test("SuggestionsOptions Run button is not shown (only Generate button)", async () => {
    const flow = makeFlow();
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        onRun={vi.fn()}
        flow={flow}
        presets={samplePresets}
      />,
    );
    await expect.element(screen.getByRole("button", { name: /^run$/i })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: /generate/i })).toBeVisible();
  });

  test("does not show SuggestionsOptions when no flow provided", async () => {
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        onRun={vi.fn()}
        presets={samplePresets}
      />,
    );
    await expect.element(screen.getByText(/^Preset$/i)).not.toBeInTheDocument();
  });
});

// ── IngestDialog — generate flow ──────────────────────────────────────────────

describe("IngestDialog — generate button calls onRun with source", () => {
  test("calls onRun with text source when Generate is clicked", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const screen = await render(
      <IngestDialog modal={false} open onOpenChange={vi.fn()} onRun={onRun} />,
    );
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("pasta recipe");
    await screen.getByRole("button", { name: /generate/i }).click();
    await vi.waitFor(() => expect(onRun).toHaveBeenCalledOnce());
    const [source] = onRun.mock.calls[0] as [SourceShape];
    expect(source.kind).toBe("text");
    if (source.kind === "text") {
      expect(source.content).toContain("pasta");
    }
  });

  test("calls onRun with prompt source shape", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const screen = await render(
      <IngestDialog modal={false} open onOpenChange={vi.fn()} onRun={onRun} />,
    );
    await screen.getByRole("button", { name: /from prompt/i }).click();
    await screen.getByRole("textbox").fill("quick Thai curry");
    await screen.getByRole("button", { name: /generate/i }).click();
    await vi.waitFor(() => expect(onRun).toHaveBeenCalledOnce());
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
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        onRun={onRun}
        reviewChildren={<div data-testid="review-body">Review content</div>}
      />,
    );
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("content here");
    await screen.getByRole("button", { name: /generate/i }).click();
    await expect.element(screen.getByTestId("review-body")).toBeVisible();
    await expect.element(screen.getByText("Review content")).toBeVisible();
  });

  test("shows Try different source back button in review phase", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        onRun={onRun}
        reviewChildren={<div>Review</div>}
      />,
    );
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("content");
    await screen.getByRole("button", { name: /generate/i }).click();
    await expect.element(screen.getByText(/try different source/i)).toBeVisible();
  });

  test("clicking back returns to source phase", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        onRun={onRun}
        reviewChildren={<div>Review</div>}
      />,
    );
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("content");
    await screen.getByRole("button", { name: /generate/i }).click();
    await screen.getByText(/try different source/i).click();
    await expect.element(screen.getByRole("button", { name: /from file/i })).toBeVisible();
  });

  test("closes dialog instead of entering review phase when no reviewChildren", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const screen = await render(
      <IngestDialog modal={false} open onOpenChange={onOpenChange} onRun={onRun} />,
    );
    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("content");
    await screen.getByRole("button", { name: /generate/i }).click();
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

// ── IngestDialog — end-to-end ingest flow ─────────────────────────────────────

describe("IngestDialog — end-to-end ingest (prompt source)", () => {
  test("full ingest: select prompt source → generate → view review body", async () => {
    const receivedSources: SourceShape[] = [];
    const onRun = vi.fn().mockImplementation(async (source: SourceShape) => {
      receivedSources.push(source);
    });

    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        title="Enhance recipe"
        onRun={onRun}
        reviewChildren={<div data-testid="suggestions">3 suggestions</div>}
      />,
    );

    await screen.getByRole("button", { name: /from prompt/i }).click();
    await screen.getByRole("textbox").fill("spicy vegetarian ramen");
    await screen.getByRole("button", { name: /generate/i }).click();

    await expect.element(screen.getByTestId("suggestions")).toBeVisible();
    await expect.element(screen.getByText("3 suggestions")).toBeVisible();

    expect(receivedSources).toHaveLength(1);
    expect(receivedSources[0].kind).toBe("prompt");
  });

  test("full ingest: select text source → generate → view review body", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);

    const screen = await render(
      <IngestDialog
        modal={false}
        open
        onOpenChange={vi.fn()}
        title="Enhance ingredient"
        onRun={onRun}
        reviewChildren={<div data-testid="review">Review here</div>}
      />,
    );

    await screen.getByRole("button", { name: /from text/i }).click();
    await screen.getByRole("textbox").fill("# Cardamom\n\nAromatic spice from India.");
    await screen.getByRole("button", { name: /generate/i }).click();

    await expect.element(screen.getByTestId("review")).toBeVisible();
    const [source] = onRun.mock.calls[0] as [SourceShape];
    expect(source.kind).toBe("text");
  });
});
