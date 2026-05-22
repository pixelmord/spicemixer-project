// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

import { ConfidenceBadge } from "../src/components/confidence-badge";
import { AcceptRejectButtons } from "../src/components/accept-reject-buttons";
import { TextSuggestionRow } from "../src/components/text-suggestion-row";
import { TagsSuggestionRow } from "../src/components/tags-suggestion-row";
import { EnumSuggestionRow } from "../src/components/enum-suggestion-row";
import { MultiEnumSuggestionRow } from "../src/components/multi-enum-suggestion-row";
import { DateSuggestionRow } from "../src/components/date-suggestion-row";
import { SuggestionTraceInfo } from "../src/components/suggestion-trace-info";

// ── ConfidenceBadge ──────────────────────────────────────────────────────────

describe("ConfidenceBadge", () => {
  test("renders 'high' variant with correct text and aria-label", async () => {
    const screen = await render(<ConfidenceBadge confidence="high" />);
    await expect.element(screen.getByText("high")).toBeVisible();
    await expect.element(screen.getByText("high")).toHaveAttribute("aria-label", "high confidence");
  });

  test("renders 'medium' variant", async () => {
    const screen = await render(<ConfidenceBadge confidence="medium" />);
    await expect.element(screen.getByText("medium")).toBeVisible();
    await expect.element(screen.getByLabelText("medium confidence")).toBeVisible();
  });

  test("renders 'low' variant", async () => {
    const screen = await render(<ConfidenceBadge confidence="low" />);
    await expect.element(screen.getByText("low")).toBeVisible();
    await expect.element(screen.getByLabelText("low confidence")).toBeVisible();
  });

  test("applies high variant classes", async () => {
    const screen = await render(<ConfidenceBadge confidence="high" />);
    await expect.element(screen.getByText("high")).toHaveClass(/green/);
  });

  test("applies medium variant classes", async () => {
    const screen = await render(<ConfidenceBadge confidence="medium" />);
    await expect.element(screen.getByText("medium")).toHaveClass(/yellow/);
  });

  test("applies low variant classes", async () => {
    const screen = await render(<ConfidenceBadge confidence="low" />);
    await expect.element(screen.getByText("low")).toHaveClass(/red/);
  });
});

// ── AcceptRejectButtons ──────────────────────────────────────────────────────

describe("AcceptRejectButtons", () => {
  test("calls onAccept when accept button is clicked", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const screen = await render(<AcceptRejectButtons onAccept={onAccept} onReject={onReject} />);
    await screen.getByRole("button", { name: /accept/i }).click();
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();
  });

  test("calls onReject when reject button is clicked", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const screen = await render(<AcceptRejectButtons onAccept={onAccept} onReject={onReject} />);
    await screen.getByRole("button", { name: /reject/i }).click();
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  test("both buttons are disabled when disabled prop is true", async () => {
    const screen = await render(
      <AcceptRejectButtons onAccept={vi.fn()} onReject={vi.fn()} disabled />,
    );
    await expect.element(screen.getByRole("button", { name: /accept/i })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: /reject/i })).toBeDisabled();
  });
});

// ── TextSuggestionRow ────────────────────────────────────────────────────────

describe("TextSuggestionRow", () => {
  test("renders the value text", async () => {
    const screen = await render(<TextSuggestionRow value="Suggested text" />);
    await expect.element(screen.getByText("Suggested text")).toBeVisible();
  });

  test("read-only mode hides accept/reject buttons", async () => {
    const screen = await render(
      <TextSuggestionRow value="hello" readOnly onApply={vi.fn()} onReject={vi.fn()} />,
    );
    await expect.element(screen.getByRole("button", { name: /accept/i })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });

  test("interactive mode shows accept/reject buttons", async () => {
    const screen = await render(
      <TextSuggestionRow value="hello" onApply={vi.fn()} onReject={vi.fn()} />,
    );
    await expect.element(screen.getByRole("button", { name: /accept/i })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /reject/i })).toBeVisible();
  });

  test("calls onApply with value when accept is clicked", async () => {
    const onApply = vi.fn();
    const screen = await render(
      <TextSuggestionRow value="hello" onApply={onApply} onReject={vi.fn()} />,
    );
    await screen.getByRole("button", { name: /accept/i }).click();
    expect(onApply).toHaveBeenCalledWith("hello");
  });

  test("renders confidence badge when provided", async () => {
    const screen = await render(<TextSuggestionRow value="x" confidence="high" />);
    await expect.element(screen.getByLabelText("high confidence")).toBeVisible();
  });

  test("renders summary when provided", async () => {
    const screen = await render(<TextSuggestionRow value="x" summary="AI summary here" />);
    await expect.element(screen.getByText("AI summary here")).toBeVisible();
  });
});

// ── TagsSuggestionRow ────────────────────────────────────────────────────────

describe("TagsSuggestionRow", () => {
  const tags = ["spicy", "savory", "umami"];

  test("renders all tags", async () => {
    const screen = await render(<TagsSuggestionRow tags={tags} />);
    for (const tag of tags) {
      await expect.element(screen.getByText(tag)).toBeVisible();
    }
  });

  test("read-only mode hides interactive controls", async () => {
    const screen = await render(
      <TagsSuggestionRow tags={tags} readOnly onApply={vi.fn()} onReject={vi.fn()} />,
    );
    await expect.element(screen.getByRole("button", { name: /add all/i })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  test("interactive 'Add all' calls onApply with full tag list", async () => {
    const onApply = vi.fn();
    const screen = await render(
      <TagsSuggestionRow tags={tags} onApply={onApply} onReject={vi.fn()} />,
    );
    await screen.getByRole("button", { name: /add all/i }).click();
    expect(onApply).toHaveBeenCalledWith(tags);
  });

  test("per-chip click applies one tag (partial pick)", async () => {
    const onApply = vi.fn();
    const onApplyPartial = vi.fn();
    const screen = await render(
      <TagsSuggestionRow
        tags={tags}
        onApply={onApply}
        onApplyPartial={onApplyPartial}
        onReject={vi.fn()}
      />,
    );
    await screen.getByRole("button", { name: /\+ spicy/ }).click();
    expect(onApplyPartial).toHaveBeenCalledWith(["spicy"]);
    expect(onApply).not.toHaveBeenCalled();
  });

  test("accepting the last remaining chip finalizes via onApply", async () => {
    const onApply = vi.fn();
    const onApplyPartial = vi.fn();
    const screen = await render(
      <TagsSuggestionRow
        tags={["a", "b"]}
        onApply={onApply}
        onApplyPartial={onApplyPartial}
        onReject={vi.fn()}
      />,
    );
    await screen.getByRole("button", { name: /\+ a/ }).click();
    await screen.getByRole("button", { name: /\+ b/ }).click();
    expect(onApply).toHaveBeenCalledWith(["a", "b"]);
  });

  test("Dismiss calls onReject", async () => {
    const onReject = vi.fn();
    const screen = await render(
      <TagsSuggestionRow tags={tags} onApply={vi.fn()} onReject={onReject} />,
    );
    await screen.getByRole("button", { name: /dismiss/i }).click();
    expect(onReject).toHaveBeenCalled();
  });
});

// ── EnumSuggestionRow ────────────────────────────────────────────────────────

describe("EnumSuggestionRow", () => {
  test("renders the enum value", async () => {
    const screen = await render(
      <EnumSuggestionRow value="Italian" options={["Italian", "Mexican", "Thai"]} />,
    );
    await expect.element(screen.getByText("Italian")).toBeVisible();
  });

  test("read-only mode hides accept/reject buttons", async () => {
    const screen = await render(
      <EnumSuggestionRow
        value="Italian"
        options={["Italian"]}
        readOnly
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    await expect.element(screen.getByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  test("interactive mode shows accept/reject buttons", async () => {
    const screen = await render(
      <EnumSuggestionRow
        value="Italian"
        options={["Italian"]}
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    await expect.element(screen.getByRole("button", { name: /accept/i })).toBeVisible();
  });
});

// ── MultiEnumSuggestionRow ───────────────────────────────────────────────────

describe("MultiEnumSuggestionRow", () => {
  const values = ["Vegan", "Gluten-free"];

  test("renders all selected values", async () => {
    const screen = await render(<MultiEnumSuggestionRow values={values} options={values} />);
    for (const v of values) {
      await expect.element(screen.getByText(v)).toBeVisible();
    }
  });

  test("read-only mode hides accept/reject buttons", async () => {
    const screen = await render(
      <MultiEnumSuggestionRow
        values={values}
        options={values}
        readOnly
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    await expect.element(screen.getByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  test("interactive mode calls onApply with values array", async () => {
    const onApply = vi.fn();
    const screen = await render(
      <MultiEnumSuggestionRow
        values={values}
        options={values}
        onApply={onApply}
        onReject={vi.fn()}
      />,
    );
    await screen.getByRole("button", { name: /accept/i }).click();
    expect(onApply).toHaveBeenCalledWith(values);
  });
});

// ── DateSuggestionRow ────────────────────────────────────────────────────────

describe("DateSuggestionRow", () => {
  test("renders formatted date", async () => {
    const screen = await render(<DateSuggestionRow value="2024-03-15" />);
    // Date is formatted; container should have non-empty text
    expect(screen.container.textContent ?? "").not.toBe("");
  });

  test("read-only mode hides accept/reject buttons", async () => {
    const screen = await render(
      <DateSuggestionRow value="2024-03-15" readOnly onApply={vi.fn()} onReject={vi.fn()} />,
    );
    await expect.element(screen.getByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  test("interactive mode calls onApply with ISO string", async () => {
    const onApply = vi.fn();
    const screen = await render(
      <DateSuggestionRow value="2024-03-15" onApply={onApply} onReject={vi.fn()} />,
    );
    await screen.getByRole("button", { name: /accept/i }).click();
    expect(onApply).toHaveBeenCalledWith("2024-03-15");
  });
});

// ── SuggestionTraceInfo ──────────────────────────────────────────────────────

describe("SuggestionTraceInfo", () => {
  const trace = {
    traceId: "abc-123",
    model: "claude-sonnet-4-6",
    runtimeMs: 1234,
    preset: "default",
    userPrompt: "Make it better",
    confidence: "high" as const,
  };

  test("renders info trigger button", async () => {
    const screen = await render(<SuggestionTraceInfo trace={trace} />);
    await expect.element(screen.getByLabelText(/show trace info/i)).toBeVisible();
  });

  test("renders trace scalars: model, runtime, preset, userPrompt, confidence, traceId", async () => {
    const screen = await render(<SuggestionTraceInfo trace={trace} />);
    await expect.element(screen.getByText(trace.model)).toBeInTheDocument();
    await expect.element(screen.getByText(`${trace.runtimeMs}ms`)).toBeInTheDocument();
    await expect.element(screen.getByText(trace.preset!)).toBeInTheDocument();
    await expect.element(screen.getByText(trace.userPrompt!)).toBeInTheDocument();
    await expect.element(screen.getByText(trace.confidence!)).toBeInTheDocument();
    await expect.element(screen.getByText(trace.traceId)).toBeInTheDocument();
  });

  test("does not render token counts", async () => {
    const screen = await render(<SuggestionTraceInfo trace={trace} />);
    expect(screen.container.textContent ?? "").not.toMatch(/token/i);
  });

  test("does not render cost information", async () => {
    const screen = await render(<SuggestionTraceInfo trace={trace} />);
    expect(screen.container.textContent ?? "").not.toMatch(/cost/i);
    expect(screen.container.textContent ?? "").not.toMatch(/\$/);
  });

  test("does not render system prompt", async () => {
    const screen = await render(<SuggestionTraceInfo trace={trace} />);
    expect(screen.container.textContent ?? "").not.toMatch(/system prompt/i);
  });

  test("does not render response body", async () => {
    const screen = await render(<SuggestionTraceInfo trace={trace} />);
    expect(screen.container.textContent ?? "").not.toMatch(/response body/i);
  });

  test("renders without optional fields", async () => {
    const minimalTrace = {
      traceId: "xyz-999",
      model: "claude-haiku-4-5",
      runtimeMs: 500,
    };
    const screen = await render(<SuggestionTraceInfo trace={minimalTrace} />);
    await expect.element(screen.getByText(minimalTrace.model)).toBeInTheDocument();
    await expect.element(screen.getByText("500ms")).toBeInTheDocument();
    await expect.element(screen.getByText(minimalTrace.traceId)).toBeInTheDocument();
  });
});
