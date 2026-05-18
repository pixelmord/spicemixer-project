// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  TranslateEntityDialog,
  type TranslateEntityDialogProps,
  type TranslationMeta,
} from "../src/components/translate-entity-dialog";
import type {
  EntityRef,
  AiEventLog,
  Origin,
  AiContract,
  RunParams,
  RunResult,
} from "../src/components/use-ai-suggestions";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sourceRef: EntityRef = { kind: "recipe", id: "cardamom-cake" };
const sourceLocale = "en";
const sourceData: Record<string, unknown> = {
  name: "Cardamom Cake",
  description: "A spiced cake with warm cardamom",
  slug: "cardamom-cake",
};

const mockOrigin: Origin = {
  surface: "admin",
  action: "translate",
  userInitiated: true,
  runId: "run-translate-001",
  triggeredBy: "editor",
};

const mockAiEventLog: AiEventLog = {
  read: vi.fn().mockResolvedValue([]),
  append: vi.fn().mockResolvedValue(undefined),
};

// Contract with slug (recipe/mixture — two-call mode)
const recipeContract: AiContract = {
  presets: [],
  fields: {
    name: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    slug: { translation: { mode: "translate" } },
  },
};

// Contract without slug (ingredient — one-call mode)
const ingredientContract: AiContract = {
  presets: [],
  fields: {
    name: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    botanicalName: { translation: { mode: "copy" } },
  },
};

function makeSlugResult(slug = "kardamom-kuchen-de"): RunResult {
  return {
    suggestions: {
      slug: {
        kind: "single",
        value: slug,
        confidence: "high",
        summary: "German slug for cardamom cake",
        hash: "slug-hash-001",
        traceId: "trace-slug",
      },
    },
    autoApplied: {},
    traces: { slug: { traceId: "trace-slug", model: "claude-sonnet-4-6", runtimeMs: 200 } },
  };
}

function makeBulkResult(): RunResult {
  return {
    suggestions: {
      name: {
        kind: "single",
        value: "Kardamom-Kuchen",
        confidence: "high",
        summary: "German name",
        hash: "name-hash-001",
        traceId: "trace-name",
      },
      description: {
        kind: "single",
        value: "Ein gewürzter Kuchen mit warmem Kardamom",
        confidence: "high",
        summary: "German description",
        hash: "desc-hash-001",
        traceId: "trace-desc",
      },
    },
    autoApplied: {},
    traces: {
      name: { traceId: "trace-name", model: "claude-sonnet-4-6", runtimeMs: 300 },
      description: { traceId: "trace-desc", model: "claude-sonnet-4-6", runtimeMs: 400 },
    },
  };
}

function makeIngredientBulkResult(): RunResult {
  return {
    suggestions: {
      name: {
        kind: "single",
        value: "Kardamom",
        confidence: "high",
        summary: "German name",
        hash: "name-hash-002",
        traceId: "trace-name-2",
      },
      description: {
        kind: "single",
        value: "Ein aromatisches Gewürz",
        confidence: "high",
        summary: "German description",
        hash: "desc-hash-002",
        traceId: "trace-desc-2",
      },
    },
    autoApplied: {},
    traces: {},
  };
}

const newEntityRef: EntityRef = { kind: "recipe", id: "kardamom-kuchen-de" };

function makeProps(
  overrides: Partial<TranslateEntityDialogProps> = {},
): TranslateEntityDialogProps {
  return {
    contract: recipeContract,
    sourceRef,
    sourceLocale,
    sourceData,
    availableLocales: ["de", "fr"],
    onFill: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(newEntityRef),
    onComplete: vi.fn(),
    aiEventLog: mockAiEventLog,
    origin: mockOrigin,
    ...overrides,
  };
}

// ── Setup step ─────────────────────────────────────────────────────────────────

describe("setup step — locale picker", () => {
  test("renders locale dropdown with available locales", () => {
    render(<TranslateEntityDialog {...makeProps()} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeDefined();
  });

  test("renders 'Start translation' button", () => {
    render(<TranslateEntityDialog {...makeProps()} />);
    expect(screen.getByRole("button", { name: /start translation/i })).toBeDefined();
  });

  test("shows all available locales as options", () => {
    render(<TranslateEntityDialog {...makeProps()} />);
    expect(screen.getByRole("option", { name: "de" })).toBeDefined();
    expect(screen.getByRole("option", { name: "fr" })).toBeDefined();
  });
});

// ── Two-call flow (recipe/mixture) ─────────────────────────────────────────────

describe("two-call flow — recipe with slug + onCheckSlugAvailable", () => {
  function makeRecipeProps() {
    const onFill = vi.fn();
    onFill
      .mockResolvedValueOnce(makeSlugResult()) // first call: slug fill
      .mockResolvedValueOnce(makeBulkResult()); // second call: bulk fill
    const onCheckSlugAvailable = vi.fn().mockResolvedValue(true);
    return {
      props: makeProps({ onFill, onCheckSlugAvailable }),
      onFill,
      onCheckSlugAvailable,
    };
  }

  test("calls onFill for slug first when onCheckSlugAvailable is provided", async () => {
    const { props, onFill } = makeRecipeProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));

    expect(onFill).toHaveBeenCalledTimes(1);
    const firstCall = onFill.mock.calls[0][0] as RunParams;
    expect(firstCall.target).toEqual(["slug"]);
    expect(firstCall.sourceContext).toMatchObject({ kind: "sibling-locale" });
  });

  test("shows slug suggestion after slug fill", async () => {
    const { props } = makeRecipeProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() => screen.getByDisplayValue("kardamom-kuchen-de"));
  });

  test("checks slug availability automatically after slug fill", async () => {
    const { props, onCheckSlugAvailable } = makeRecipeProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() =>
      expect(onCheckSlugAvailable).toHaveBeenCalledWith("recipe", "kardamom-kuchen-de"),
    );
  });

  test("shows availability indicator when slug is available", async () => {
    const { props } = makeRecipeProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() => screen.getByText(/available/i));
  });

  test("allows manual slug override", async () => {
    const { props, onCheckSlugAvailable } = makeRecipeProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() => screen.getByDisplayValue("kardamom-kuchen-de"));

    const input = screen.getByDisplayValue("kardamom-kuchen-de");
    await userEvent.clear(input);
    await userEvent.type(input, "custom-slug-de");

    await waitFor(() =>
      expect(onCheckSlugAvailable).toHaveBeenCalledWith("recipe", "custom-slug-de"),
    );
  });

  test("calls bulk onFill after slug confirmation", async () => {
    const { props, onFill } = makeRecipeProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() => screen.getByRole("button", { name: /continue/i }));

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(onFill).toHaveBeenCalledTimes(2));
    const secondCall = onFill.mock.calls[1][0] as RunParams;
    expect(secondCall.target).not.toContain("slug");
    expect(secondCall.sourceContext).toMatchObject({ kind: "sibling-locale" });
  });

  test("shows review step after bulk fill", async () => {
    const { props } = makeRecipeProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() => screen.getByRole("button", { name: /continue/i }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => screen.getByRole("button", { name: /accept all & save draft/i }));
  });
});

// ── One-call flow (ingredient/pairing) ────────────────────────────────────────

describe("one-call flow — ingredient without onCheckSlugAvailable", () => {
  function makeIngredientProps() {
    const onFill = vi.fn().mockResolvedValue(makeIngredientBulkResult());
    return {
      props: makeProps({
        contract: ingredientContract,
        sourceRef: { kind: "ingredient", id: "cardamom" },
        sourceData: {
          name: "Cardamom",
          description: "An aromatic spice",
          botanicalName: "Elettaria cardamomum",
        },
        onFill,
        // No onCheckSlugAvailable — single-call mode
      }),
      onFill,
    };
  }

  test("calls onFill once for all fields (no slug step)", async () => {
    const { props, onFill } = makeIngredientProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));

    await waitFor(() => expect(onFill).toHaveBeenCalledTimes(1));
    const call = onFill.mock.calls[0][0] as RunParams;
    expect(call.target).toBeUndefined(); // fill all fields
    expect(call.sourceContext).toMatchObject({ kind: "sibling-locale" });
  });

  test("does not show slug input step", async () => {
    const { props } = makeIngredientProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));

    await waitFor(() => screen.getByRole("button", { name: /accept all & save draft/i }));
    expect(screen.queryByText(/confirm slug/i)).toBeNull();
  });

  test("goes directly to review after single fill", async () => {
    const { props } = makeIngredientProps();
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));

    await waitFor(() => screen.getByRole("button", { name: /accept all & save draft/i }));
  });
});

// ── Review step ────────────────────────────────────────────────────────────────

describe("review step", () => {
  async function renderAtReview(onFill?: (params: RunParams) => Promise<RunResult>) {
    const mockOnFill = (onFill ?? vi.fn().mockResolvedValue(makeIngredientBulkResult())) as (
      params: RunParams,
    ) => Promise<RunResult>;
    const onCreate = vi.fn().mockResolvedValue(newEntityRef);
    const props = makeProps({
      contract: ingredientContract,
      sourceRef: { kind: "ingredient", id: "cardamom" },
      sourceData: {
        name: "Cardamom",
        description: "An aromatic spice",
        botanicalName: "Elettaria cardamomum",
      },
      onFill: mockOnFill,
      onCreate,
    });
    render(<TranslateEntityDialog {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() => screen.getByRole("button", { name: /accept all & save draft/i }));
    return { onCreate, onFill: mockOnFill };
  }

  test("shows 'Accept all & save draft' as primary CTA", async () => {
    await renderAtReview();
    expect(screen.getByRole("button", { name: /accept all & save draft/i })).toBeDefined();
  });

  test("shows 'Review N fields' disclosure button", async () => {
    await renderAtReview();
    expect(screen.getByRole("button", { name: /review \d+ fields/i })).toBeDefined();
  });

  test("expands per-field review when disclosure is clicked", async () => {
    await renderAtReview();
    await userEvent.click(screen.getByRole("button", { name: /review \d+ fields/i }));
    // Per-field suggestions should be visible
    expect(screen.getByText("Kardamom")).toBeDefined();
  });

  test("shows source-locale content in sourceSlot when review is expanded", async () => {
    await renderAtReview();
    await userEvent.click(screen.getByRole("button", { name: /review \d+ fields/i }));
    // Source text for name field should appear
    expect(screen.getByText("Cardamom")).toBeDefined();
  });
});

// ── Integration: Accept all & save draft ──────────────────────────────────────

describe("integration: accept all & save draft", () => {
  async function runFullFlow() {
    const onFill = vi.fn().mockResolvedValue(makeIngredientBulkResult());
    const onCreate = vi.fn().mockResolvedValue(newEntityRef);
    const onComplete = vi.fn();
    const aiEventLogMock: AiEventLog = {
      read: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockResolvedValue(undefined),
    };
    const props = makeProps({
      contract: ingredientContract,
      sourceRef: { kind: "ingredient", id: "cardamom" },
      sourceData: {
        name: "Cardamom",
        description: "An aromatic spice",
        botanicalName: "Elettaria cardamomum",
      },
      onFill,
      onCreate,
      onComplete,
      aiEventLog: aiEventLogMock,
    });
    render(<TranslateEntityDialog {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    await waitFor(() => screen.getByRole("button", { name: /accept all & save draft/i }));
    await userEvent.click(screen.getByRole("button", { name: /accept all & save draft/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    return { onCreate, onComplete, aiEventLog: aiEventLogMock };
  }

  test("calls onCreate with target locale", async () => {
    const { onCreate } = await runFullFlow();
    const [targetLocale] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(targetLocale).toBe("de");
  });

  test("calls onCreate with fields containing suggestion values", async () => {
    const { onCreate } = await runFullFlow();
    const [, , fields] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(fields.name).toBe("Kardamom");
    expect(fields.description).toBe("Ein aromatisches Gewürz");
  });

  test("includes copy-mode field values from source in fields", async () => {
    const { onCreate } = await runFullFlow();
    const [, , fields] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(fields.botanicalName).toBe("Elettaria cardamomum");
  });

  test("calls onCreate with correct translationOf in meta", async () => {
    const { onCreate } = await runFullFlow();
    const [, , , meta] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(meta.translationOf).toEqual({ kind: "ingredient", id: "cardamom" });
  });

  test("calls onCreate with draft: true in meta", async () => {
    const { onCreate } = await runFullFlow();
    const [, , , meta] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(meta.draft).toBe(true);
  });

  test("calls onCreate with canonicalLocale in meta", async () => {
    const { onCreate } = await runFullFlow();
    const [, , , meta] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(meta.canonicalLocale).toBe("en");
  });

  test("calls onCreate with canonicalFieldHashes in meta", async () => {
    const { onCreate } = await runFullFlow();
    const [, , , meta] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(typeof meta.canonicalFieldHashes).toBe("object");
    expect(Object.keys(meta.canonicalFieldHashes).length).toBeGreaterThan(0);
  });

  test("meta includes single ingested aiEvent", async () => {
    const { onCreate } = await runFullFlow();
    const [, , , meta] = onCreate.mock.calls[0] as [
      string,
      string | undefined,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(Array.isArray(meta.aiEvents)).toBe(true);
    expect(meta.aiEvents).toHaveLength(1);
    expect(meta.aiEvents[0].type).toBe("ingested");
  });

  test("calls onComplete with new entity ref after save", async () => {
    const { onComplete } = await runFullFlow();
    expect(onComplete).toHaveBeenCalledWith(newEntityRef);
  });

  test("appends ingested event to aiEventLog for new entity ref", async () => {
    const { aiEventLog } = await runFullFlow();
    await waitFor(() =>
      expect(aiEventLog.append).toHaveBeenCalledWith(
        newEntityRef,
        expect.objectContaining({ type: "ingested" }),
      ),
    );
  });
});

// ── Integration: recipe two-call, accept all → correct slug in onCreate ────────

describe("integration: recipe two-call — slug passed to onCreate", () => {
  test("calls onCreate with confirmed slug as second argument", async () => {
    const onFill = vi.fn();
    onFill
      .mockResolvedValueOnce(makeSlugResult("kardamom-kuchen-de"))
      .mockResolvedValueOnce(makeBulkResult());
    const onCheckSlugAvailable = vi.fn().mockResolvedValue(true);
    const onCreate = vi.fn().mockResolvedValue(newEntityRef);

    render(<TranslateEntityDialog {...makeProps({ onFill, onCheckSlugAvailable, onCreate })} />);

    // Start
    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));
    // Wait for slug review step
    await waitFor(() => screen.getByRole("button", { name: /continue/i }));
    // Proceed
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    // Wait for review
    await waitFor(() => screen.getByRole("button", { name: /accept all & save draft/i }));
    // Accept all
    await userEvent.click(screen.getByRole("button", { name: /accept all & save draft/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const [, slug] = onCreate.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(slug).toBe("kardamom-kuchen-de");
  });
});

// ── sourceContext shape ────────────────────────────────────────────────────────

describe("sourceContext passed to onFill", () => {
  test("sourceContext includes sourceRef, sourceData, sourceLocale, targetLocale", async () => {
    const onFill = vi.fn().mockResolvedValue(makeIngredientBulkResult());
    render(
      <TranslateEntityDialog
        {...makeProps({
          contract: ingredientContract,
          sourceRef: { kind: "ingredient", id: "cardamom" },
          sourceData: {
            name: "Cardamom",
            description: "An aromatic spice",
            botanicalName: "Elettaria cardamomum",
          },
          onFill,
        })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /start translation/i }));

    await waitFor(() => expect(onFill).toHaveBeenCalled());
    const params = onFill.mock.calls[0][0] as RunParams;
    const ctx = params.sourceContext as {
      kind: string;
      sourceRef: EntityRef;
      sourceLocale: string;
      targetLocale: string;
    };
    expect(ctx.kind).toBe("sibling-locale");
    expect(ctx.sourceRef).toEqual({ kind: "ingredient", id: "cardamom" });
    expect(ctx.sourceLocale).toBe("en");
    expect(ctx.targetLocale).toBe("de");
  });
});
