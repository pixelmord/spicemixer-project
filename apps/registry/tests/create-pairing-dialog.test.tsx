// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  CreatePairingDialog,
  type CreatePairingDialogProps,
  type PairingCreationMeta,
} from "../src/components/create-pairing-dialog";
import type {
  EntityRef,
  AiEventLog,
  Origin,
  AiContract,
} from "../src/components/use-ai-suggestions";

afterEach(cleanup);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const recipeSourceRef: EntityRef = { kind: "recipe", id: "cardamom-cake" };
const ingredientSourceRef: EntityRef = { kind: "ingredient", id: "cardamom" };

const ingredientSuggestion = {
  otherCollection: "ingredients",
  otherSlug: "cumin",
  rationale: "Cardamom and cumin share warm, earthy undertones common in Middle Eastern cuisine.",
};

const recipeSuggestion = {
  otherCollection: "recipes",
  otherSlug: "harira-soup",
  rationale: "Cardamom cake pairs beautifully with harira soup as a dessert finish.",
};

const mockOrigin: Origin = {
  surface: "admin",
  action: "create-pairing",
  userInitiated: true,
  runId: "run-pairing-001",
  triggeredBy: "editor",
};

const mockAiEventLog: AiEventLog = {
  read: vi.fn().mockResolvedValue([]),
  append: vi.fn().mockResolvedValue(undefined),
};

const pairingContract: AiContract = {
  presets: [],
  fields: {
    description: { translation: { mode: "translate" } },
    featured: { translation: { mode: "copy" } },
    endpoints: { translation: { mode: "copy" } },
  },
};

const newPairingRef: EntityRef = { kind: "pairing", id: "cardamom-cumin" };

function makeProps(overrides: Partial<CreatePairingDialogProps> = {}): CreatePairingDialogProps {
  return {
    contract: pairingContract,
    sourceRef: recipeSourceRef,
    aiSuggestion: ingredientSuggestion,
    locale: "en",
    onFill: vi.fn().mockResolvedValue({ suggestions: {}, autoApplied: {}, traces: {} }),
    onCreate: vi.fn().mockResolvedValue(newPairingRef),
    onComplete: vi.fn(),
    aiEventLog: mockAiEventLog,
    origin: mockOrigin,
    ...overrides,
  };
}

// ── Preflight rendering ────────────────────────────────────────────────────────

describe("preflight — renders endpoints and fields", () => {
  test("renders a heading for adding a pairing", () => {
    render(<CreatePairingDialog {...makeProps()} />);
    expect(screen.getByRole("heading", { name: /add pairing/i })).toBeDefined();
  });

  test("renders source endpoint collection and slug", () => {
    render(<CreatePairingDialog {...makeProps()} />);
    expect(screen.getByText(/recipes.*cardamom-cake|cardamom-cake.*recipes/i)).toBeDefined();
  });

  test("renders other endpoint collection and slug", () => {
    render(<CreatePairingDialog {...makeProps()} />);
    expect(screen.getByText(/ingredients.*cumin|cumin.*ingredients/i)).toBeDefined();
  });

  test("renders description textarea seeded from rationale", () => {
    render(<CreatePairingDialog {...makeProps()} />);
    const textarea = screen.getByRole("textbox");
    expect((textarea as HTMLTextAreaElement).value).toBe(ingredientSuggestion.rationale);
  });

  test("renders featured checkbox", () => {
    render(<CreatePairingDialog {...makeProps()} />);
    expect(screen.getByRole("checkbox")).toBeDefined();
  });

  test("renders Save pairing button", () => {
    render(<CreatePairingDialog {...makeProps()} />);
    expect(screen.getByRole("button", { name: /save pairing/i })).toBeDefined();
  });
});

// ── Featured seeding rule ─────────────────────────────────────────────────────

describe("featured seeding rule", () => {
  test("featured defaults to false for recipe-bearing source", () => {
    render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: recipeSourceRef,
          aiSuggestion: ingredientSuggestion,
        })}
      />,
    );
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  test("featured defaults to false for recipe as other endpoint", () => {
    render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: ingredientSourceRef,
          aiSuggestion: recipeSuggestion,
        })}
      />,
    );
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  test("featured defaults to true for ingredient-only pair", () => {
    render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: ingredientSourceRef,
          aiSuggestion: ingredientSuggestion,
        })}
      />,
    );
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  test("featured defaults to false for mixture source", () => {
    render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: { kind: "mixture", id: "harissa" },
          aiSuggestion: ingredientSuggestion,
        })}
      />,
    );
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});

// ── Integration: save flow ────────────────────────────────────────────────────

describe("integration: save flow", () => {
  async function runSaveFlow(props: CreatePairingDialogProps = makeProps()) {
    render(<CreatePairingDialog {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /save pairing/i }));
    await waitFor(() =>
      expect((props.onCreate as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0),
    );
    return props;
  }

  test("calls onCreate with the correct locale", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate }));
    const [locale] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(locale).toBe("en");
  });

  test("fields.endpoints[0] is the source endpoint", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate }));
    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    const endpoints = fields.endpoints as Array<{ collection: string; slug: string }>;
    expect(endpoints[0]).toEqual({ collection: "recipes", slug: "cardamom-cake" });
  });

  test("fields.endpoints[1] is the other endpoint from aiSuggestion", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate }));
    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    const endpoints = fields.endpoints as Array<{ collection: string; slug: string }>;
    expect(endpoints[1]).toEqual({ collection: "ingredients", slug: "cumin" });
  });

  test("fields.description is seeded from rationale", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate }));
    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(fields.description).toBe(ingredientSuggestion.rationale);
  });

  test("fields.featured reflects the seeded value (false for recipe source)", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ sourceRef: recipeSourceRef, onCreate }));
    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(fields.featured).toBe(false);
  });

  test("meta.aiEvents has a single ingested event", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate }));
    const [, , meta] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(Array.isArray(meta.aiEvents)).toBe(true);
    expect(meta.aiEvents).toHaveLength(1);
    expect(meta.aiEvents[0].type).toBe("ingested");
  });

  test("ingested event traceId matches origin.runId", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate }));
    const [, , meta] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(meta.aiEvents[0].traceId).toBe(mockOrigin.runId);
  });

  test("meta.draft is true", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate }));
    const [, , meta] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(meta.draft).toBe(true);
  });

  test("calls onComplete with the new entity ref after save", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    const onComplete = vi.fn();
    await runSaveFlow(makeProps({ onCreate, onComplete }));
    expect(onComplete).toHaveBeenCalledWith(newPairingRef);
  });

  test("appends ingested event to aiEventLog for new entity ref", async () => {
    const aiEventLogMock: AiEventLog = {
      read: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockResolvedValue(undefined),
    };
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    await runSaveFlow(makeProps({ onCreate, aiEventLog: aiEventLogMock }));
    await waitFor(() =>
      expect(aiEventLogMock.append).toHaveBeenCalledWith(
        newPairingRef,
        expect.objectContaining({ type: "ingested" }),
      ),
    );
  });
});

// ── Editor overrides ──────────────────────────────────────────────────────────

describe("editor can override description and featured", () => {
  test("save uses edited description", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    render(<CreatePairingDialog {...makeProps({ onCreate })} />);

    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "My custom description");

    await userEvent.click(screen.getByRole("button", { name: /save pairing/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());

    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(fields.description).toBe("My custom description");
  });

  test("save uses toggled featured value", async () => {
    // Start with recipe source (featured=false), then toggle to true
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    render(<CreatePairingDialog {...makeProps({ sourceRef: recipeSourceRef, onCreate })} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    await userEvent.click(screen.getByRole("button", { name: /save pairing/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());

    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(fields.featured).toBe(true);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  test("shows error message when onCreate rejects", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<CreatePairingDialog {...makeProps({ onCreate })} />);

    await userEvent.click(screen.getByRole("button", { name: /save pairing/i }));

    await waitFor(() => screen.getByText(/network error/i));
    // Returns to review step so user can retry
    expect(screen.getByRole("button", { name: /save pairing/i })).toBeDefined();
  });
});

// ── ingredient-only source: endpoints use plural collection ───────────────────

describe("endpoint collection derived from sourceRef.kind", () => {
  test("ingredient source maps to 'ingredients' collection", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: ingredientSourceRef,
          aiSuggestion: ingredientSuggestion,
          onCreate,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /save pairing/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    const endpoints = fields.endpoints as Array<{ collection: string; slug: string }>;
    expect(endpoints[0]).toEqual({ collection: "ingredients", slug: "cardamom" });
  });

  test("mixture source maps to 'mixtures' collection", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: { kind: "mixture", id: "harissa" },
          aiSuggestion: ingredientSuggestion,
          onCreate,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /save pairing/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    const endpoints = fields.endpoints as Array<{ collection: string; slug: string }>;
    expect(endpoints[0]).toEqual({ collection: "mixtures", slug: "harissa" });
  });
});
