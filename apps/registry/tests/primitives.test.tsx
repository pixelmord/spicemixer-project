// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { ConfidenceBadge } from "../src/components/confidence-badge";
import { AcceptRejectButtons } from "../src/components/accept-reject-buttons";
import { TextSuggestionRow } from "../src/components/text-suggestion-row";
import { TagsSuggestionRow } from "../src/components/tags-suggestion-row";
import { EnumSuggestionRow } from "../src/components/enum-suggestion-row";
import { MultiEnumSuggestionRow } from "../src/components/multi-enum-suggestion-row";
import { DateSuggestionRow } from "../src/components/date-suggestion-row";
import { SuggestionTraceInfo } from "../src/components/suggestion-trace-info";

afterEach(cleanup);

// ── ConfidenceBadge ──────────────────────────────────────────────────────────

describe("ConfidenceBadge", () => {
  test("renders 'high' variant with correct text and aria-label", () => {
    render(<ConfidenceBadge confidence="high" />);
    const badge = screen.getByText("high");
    expect(badge).toBeDefined();
    expect(badge.getAttribute("aria-label")).toBe("high confidence");
  });

  test("renders 'medium' variant", () => {
    render(<ConfidenceBadge confidence="medium" />);
    expect(screen.getByText("medium")).toBeDefined();
    expect(screen.getByLabelText("medium confidence")).toBeDefined();
  });

  test("renders 'low' variant", () => {
    render(<ConfidenceBadge confidence="low" />);
    expect(screen.getByText("low")).toBeDefined();
    expect(screen.getByLabelText("low confidence")).toBeDefined();
  });

  test("applies high variant classes", () => {
    render(<ConfidenceBadge confidence="high" />);
    const badge = screen.getByText("high");
    expect(badge.className).toContain("green");
  });

  test("applies medium variant classes", () => {
    render(<ConfidenceBadge confidence="medium" />);
    const badge = screen.getByText("medium");
    expect(badge.className).toContain("yellow");
  });

  test("applies low variant classes", () => {
    render(<ConfidenceBadge confidence="low" />);
    const badge = screen.getByText("low");
    expect(badge.className).toContain("red");
  });
});

// ── AcceptRejectButtons ──────────────────────────────────────────────────────

describe("AcceptRejectButtons", () => {
  test("calls onAccept when accept button is clicked", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<AcceptRejectButtons onAccept={onAccept} onReject={onReject} />);
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();
  });

  test("calls onReject when reject button is clicked", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<AcceptRejectButtons onAccept={onAccept} onReject={onReject} />);
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  test("both buttons are disabled when disabled prop is true", () => {
    render(<AcceptRejectButtons onAccept={vi.fn()} onReject={vi.fn()} disabled />);
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

// ── TextSuggestionRow ────────────────────────────────────────────────────────

describe("TextSuggestionRow", () => {
  test("renders the value text", () => {
    render(<TextSuggestionRow value="Suggested text" />);
    expect(screen.getByText("Suggested text")).toBeDefined();
  });

  test("read-only mode hides accept/reject buttons", () => {
    render(<TextSuggestionRow value="hello" readOnly onApply={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
  });

  test("interactive mode shows accept/reject buttons", () => {
    render(<TextSuggestionRow value="hello" onApply={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByRole("button", { name: /accept/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reject/i })).toBeDefined();
  });

  test("calls onApply with value when accept is clicked", async () => {
    const onApply = vi.fn();
    render(<TextSuggestionRow value="hello" onApply={onApply} onReject={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onApply).toHaveBeenCalledWith("hello");
  });

  test("renders confidence badge when provided", () => {
    render(<TextSuggestionRow value="x" confidence="high" />);
    expect(screen.getByLabelText("high confidence")).toBeDefined();
  });

  test("renders summary when provided", () => {
    render(<TextSuggestionRow value="x" summary="AI summary here" />);
    expect(screen.getByText("AI summary here")).toBeDefined();
  });
});

// ── TagsSuggestionRow ────────────────────────────────────────────────────────

describe("TagsSuggestionRow", () => {
  const tags = ["spicy", "savory", "umami"];

  test("renders all tags", () => {
    render(<TagsSuggestionRow tags={tags} />);
    for (const tag of tags) {
      expect(screen.getByText(tag)).toBeDefined();
    }
  });

  test("read-only mode hides accept/reject buttons", () => {
    render(<TagsSuggestionRow tags={tags} readOnly onApply={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });

  test("interactive mode calls onApply with tags", async () => {
    const onApply = vi.fn();
    render(<TagsSuggestionRow tags={tags} onApply={onApply} onReject={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onApply).toHaveBeenCalledWith(tags);
  });
});

// ── EnumSuggestionRow ────────────────────────────────────────────────────────

describe("EnumSuggestionRow", () => {
  test("renders the enum value", () => {
    render(<EnumSuggestionRow value="Italian" options={["Italian", "Mexican", "Thai"]} />);
    expect(screen.getByText("Italian")).toBeDefined();
  });

  test("read-only mode hides accept/reject buttons", () => {
    render(
      <EnumSuggestionRow
        value="Italian"
        options={["Italian"]}
        readOnly
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });

  test("interactive mode shows accept/reject buttons", () => {
    render(
      <EnumSuggestionRow
        value="Italian"
        options={["Italian"]}
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /accept/i })).toBeDefined();
  });
});

// ── MultiEnumSuggestionRow ───────────────────────────────────────────────────

describe("MultiEnumSuggestionRow", () => {
  const values = ["Vegan", "Gluten-free"];

  test("renders all selected values", () => {
    render(<MultiEnumSuggestionRow values={values} options={values} />);
    for (const v of values) {
      expect(screen.getByText(v)).toBeDefined();
    }
  });

  test("read-only mode hides accept/reject buttons", () => {
    render(
      <MultiEnumSuggestionRow
        values={values}
        options={values}
        readOnly
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });

  test("interactive mode calls onApply with values array", async () => {
    const onApply = vi.fn();
    render(
      <MultiEnumSuggestionRow
        values={values}
        options={values}
        onApply={onApply}
        onReject={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onApply).toHaveBeenCalledWith(values);
  });
});

// ── DateSuggestionRow ────────────────────────────────────────────────────────

describe("DateSuggestionRow", () => {
  test("renders formatted date", () => {
    const { container } = render(<DateSuggestionRow value="2024-03-15" />);
    // The date is formatted so just check something is rendered
    expect(container.textContent).toBeTruthy();
  });

  test("read-only mode hides accept/reject buttons", () => {
    render(<DateSuggestionRow value="2024-03-15" readOnly onApply={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });

  test("interactive mode calls onApply with ISO string", async () => {
    const onApply = vi.fn();
    render(<DateSuggestionRow value="2024-03-15" onApply={onApply} onReject={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
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

  test("renders info trigger button", () => {
    render(<SuggestionTraceInfo trace={trace} />);
    expect(screen.getByRole("button", { name: /trace info/i })).toBeDefined();
  });

  test("renders trace scalars: model, runtime, preset, userPrompt, confidence, traceId", () => {
    render(<SuggestionTraceInfo trace={trace} />);
    expect(screen.getByText(trace.model)).toBeDefined();
    expect(screen.getByText(`${trace.runtimeMs}ms`)).toBeDefined();
    expect(screen.getByText(trace.preset!)).toBeDefined();
    expect(screen.getByText(trace.userPrompt!)).toBeDefined();
    expect(screen.getByText(trace.confidence!)).toBeDefined();
    expect(screen.getByText(trace.traceId)).toBeDefined();
  });

  test("does not render token counts", () => {
    const { container } = render(<SuggestionTraceInfo trace={trace} />);
    expect(container.textContent).not.toMatch(/token/i);
    expect(container.textContent).not.toMatch(/input token|output token/i);
  });

  test("does not render cost information", () => {
    const { container } = render(<SuggestionTraceInfo trace={trace} />);
    expect(container.textContent).not.toMatch(/cost/i);
    expect(container.textContent).not.toMatch(/\$/);
  });

  test("does not render system prompt", () => {
    const { container } = render(<SuggestionTraceInfo trace={trace} />);
    expect(container.textContent).not.toMatch(/system prompt/i);
  });

  test("does not render response body", () => {
    const { container } = render(<SuggestionTraceInfo trace={trace} />);
    expect(container.textContent).not.toMatch(/response body/i);
  });

  test("renders without optional fields", () => {
    const minimalTrace = {
      traceId: "xyz-999",
      model: "claude-haiku-4-5",
      runtimeMs: 500,
    };
    render(<SuggestionTraceInfo trace={minimalTrace} />);
    expect(screen.getByText(minimalTrace.model)).toBeDefined();
    expect(screen.getByText("500ms")).toBeDefined();
    expect(screen.getByText(minimalTrace.traceId)).toBeDefined();
  });
});
