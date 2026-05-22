// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

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
  test("renders a heading for adding a pairing", async () => {
    const screen = await render(<CreatePairingDialog {...makeProps()} />);
    await expect.element(screen.getByRole("heading", { name: /add pairing/i })).toBeVisible();
  });

  test("renders source endpoint collection and slug", async () => {
    const screen = await render(<CreatePairingDialog {...makeProps()} />);
    await expect
      .element(screen.getByText(/recipes.*cardamom-cake|cardamom-cake.*recipes/i))
      .toBeVisible();
  });

  test("renders other endpoint collection and slug", async () => {
    const screen = await render(<CreatePairingDialog {...makeProps()} />);
    await expect.element(screen.getByText(/ingredients.*cumin|cumin.*ingredients/i)).toBeVisible();
  });

  test("renders description textarea seeded from rationale", async () => {
    const screen = await render(<CreatePairingDialog {...makeProps()} />);
    await expect.element(screen.getByRole("textbox")).toHaveValue(ingredientSuggestion.rationale);
  });

  test("renders featured checkbox", async () => {
    const screen = await render(<CreatePairingDialog {...makeProps()} />);
    await expect.element(screen.getByRole("checkbox")).toBeVisible();
  });

  test("renders Save pairing button", async () => {
    const screen = await render(<CreatePairingDialog {...makeProps()} />);
    await expect.element(screen.getByRole("button", { name: /save pairing/i })).toBeVisible();
  });
});

// ── Featured seeding rule ─────────────────────────────────────────────────────

describe("featured seeding rule", () => {
  test("featured defaults to false for recipe-bearing source", async () => {
    const screen = await render(
      <CreatePairingDialog
        {...makeProps({ sourceRef: recipeSourceRef, aiSuggestion: ingredientSuggestion })}
      />,
    );
    await expect.element(screen.getByRole("checkbox")).not.toBeChecked();
  });

  test("featured defaults to false for recipe as other endpoint", async () => {
    const screen = await render(
      <CreatePairingDialog
        {...makeProps({ sourceRef: ingredientSourceRef, aiSuggestion: recipeSuggestion })}
      />,
    );
    await expect.element(screen.getByRole("checkbox")).not.toBeChecked();
  });

  test("featured defaults to true for ingredient-only pair", async () => {
    const screen = await render(
      <CreatePairingDialog
        {...makeProps({ sourceRef: ingredientSourceRef, aiSuggestion: ingredientSuggestion })}
      />,
    );
    await expect.element(screen.getByRole("checkbox")).toBeChecked();
  });

  test("featured defaults to false for mixture source", async () => {
    const screen = await render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: { kind: "mixture", id: "harissa" },
          aiSuggestion: ingredientSuggestion,
        })}
      />,
    );
    await expect.element(screen.getByRole("checkbox")).not.toBeChecked();
  });
});

// ── Integration: save flow ────────────────────────────────────────────────────

describe("integration: save flow", () => {
  async function runSaveFlow(props: CreatePairingDialogProps = makeProps()) {
    const screen = await render(<CreatePairingDialog {...props} />);
    await screen.getByRole("button", { name: /save pairing/i }).click();
    await vi.waitFor(() =>
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
    await vi.waitFor(() =>
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
    const screen = await render(<CreatePairingDialog {...makeProps({ onCreate })} />);

    const textarea = screen.getByRole("textbox");
    await textarea.clear();
    await textarea.fill("My custom description");

    await screen.getByRole("button", { name: /save pairing/i }).click();
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());

    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    expect(fields.description).toBe("My custom description");
  });

  test("save uses toggled featured value", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    const screen = await render(
      <CreatePairingDialog {...makeProps({ sourceRef: recipeSourceRef, onCreate })} />,
    );

    await screen.getByRole("checkbox").click();
    await screen.getByRole("button", { name: /save pairing/i }).click();
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());

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
    const screen = await render(<CreatePairingDialog {...makeProps({ onCreate })} />);

    await screen.getByRole("button", { name: /save pairing/i }).click();

    await expect.element(screen.getByText(/network error/i)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /save pairing/i })).toBeVisible();
  });
});

// ── ingredient-only source: endpoints use plural collection ───────────────────

describe("endpoint collection derived from sourceRef.kind", () => {
  test("ingredient source maps to 'ingredients' collection", async () => {
    const onCreate = vi.fn().mockResolvedValue(newPairingRef);
    const screen = await render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: ingredientSourceRef,
          aiSuggestion: ingredientSuggestion,
          onCreate,
        })}
      />,
    );
    await screen.getByRole("button", { name: /save pairing/i }).click();
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
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
    const screen = await render(
      <CreatePairingDialog
        {...makeProps({
          sourceRef: { kind: "mixture", id: "harissa" },
          aiSuggestion: ingredientSuggestion,
          onCreate,
        })}
      />,
    );
    await screen.getByRole("button", { name: /save pairing/i }).click();
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    const [, fields] = onCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      PairingCreationMeta,
    ];
    const endpoints = fields.endpoints as Array<{ collection: string; slug: string }>;
    expect(endpoints[0]).toEqual({ collection: "mixtures", slug: "harissa" });
  });
});
