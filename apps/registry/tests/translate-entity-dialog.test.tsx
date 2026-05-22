// @ts-nocheck — vite-plus-test does not surface @vitest/browser type augmentations
import { render } from "vitest-browser-react";
import { describe, expect, test, vi } from "vite-plus/test";

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

const recipeContract: AiContract = {
  presets: [],
  fields: {
    name: { translation: { mode: "translate" } },
    description: { translation: { mode: "translate" } },
    slug: { translation: { mode: "translate" } },
  },
};

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
  test("renders locale dropdown with available locales", async () => {
    const screen = await render(<TranslateEntityDialog {...makeProps()} />);
    await expect.element(screen.getByRole("combobox")).toBeVisible();
  });

  test("renders 'Start translation' button", async () => {
    const screen = await render(<TranslateEntityDialog {...makeProps()} />);
    await expect.element(screen.getByRole("button", { name: /start translation/i })).toBeVisible();
  });

  test("shows all available locales as options", async () => {
    const screen = await render(<TranslateEntityDialog {...makeProps()} />);
    await expect.element(screen.getByRole("option", { name: "de" })).toBeInTheDocument();
    await expect.element(screen.getByRole("option", { name: "fr" })).toBeInTheDocument();
  });
});

// ── Two-call flow ─────────────────────────────────────────────────────────────

describe("two-call flow — recipe with slug + onCheckSlugAvailable", () => {
  function makeRecipeProps() {
    const onFill = vi.fn();
    onFill.mockResolvedValueOnce(makeSlugResult()).mockResolvedValueOnce(makeBulkResult());
    const onCheckSlugAvailable = vi.fn().mockResolvedValue(true);
    return {
      props: makeProps({ onFill, onCheckSlugAvailable }),
      onFill,
      onCheckSlugAvailable,
    };
  }

  test("calls onFill for slug first when onCheckSlugAvailable is provided", async () => {
    const { props, onFill } = makeRecipeProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();

    await vi.waitFor(() => expect(onFill).toHaveBeenCalledTimes(1));
    const firstCall = onFill.mock.calls[0][0] as RunParams;
    expect(firstCall.target).toEqual(["slug"]);
    expect(firstCall.sourceContext).toMatchObject({ kind: "sibling-locale" });
  });

  test("shows slug suggestion after slug fill", async () => {
    const { props } = makeRecipeProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();
    await expect.element(screen.getByRole("textbox")).toHaveValue("kardamom-kuchen-de");
  });

  test("checks slug availability automatically after slug fill", async () => {
    const { props, onCheckSlugAvailable } = makeRecipeProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();
    await vi.waitFor(() =>
      expect(onCheckSlugAvailable).toHaveBeenCalledWith("recipe", "kardamom-kuchen-de"),
    );
  });

  test("shows availability indicator when slug is available", async () => {
    const { props } = makeRecipeProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();
    await expect.element(screen.getByText(/available/i)).toBeVisible();
  });

  test("allows manual slug override", async () => {
    const { props, onCheckSlugAvailable } = makeRecipeProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();
    const input = screen.getByRole("textbox");
    await expect.element(input).toHaveValue("kardamom-kuchen-de");
    await input.clear();
    await input.fill("custom-slug-de");

    await vi.waitFor(() =>
      expect(onCheckSlugAvailable).toHaveBeenCalledWith("recipe", "custom-slug-de"),
    );
  });

  test("calls bulk onFill after slug confirmation", async () => {
    const { props, onFill } = makeRecipeProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();
    await expect.element(screen.getByRole("button", { name: /continue/i })).toBeVisible();
    await screen.getByRole("button", { name: /continue/i }).click();

    await vi.waitFor(() => expect(onFill).toHaveBeenCalledTimes(2));
    const secondCall = onFill.mock.calls[1][0] as RunParams;
    expect(secondCall.target).not.toContain("slug");
    expect(secondCall.sourceContext).toMatchObject({ kind: "sibling-locale" });
  });

  test("shows review step after bulk fill", async () => {
    const { props } = makeRecipeProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();
    await expect.element(screen.getByRole("button", { name: /continue/i })).toBeVisible();
    await screen.getByRole("button", { name: /continue/i }).click();

    await expect
      .element(screen.getByRole("button", { name: /accept all & save draft/i }))
      .toBeVisible();
  });
});

// ── One-call flow ─────────────────────────────────────────────────────────────

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
      }),
      onFill,
    };
  }

  test("calls onFill once for all fields (no slug step)", async () => {
    const { props, onFill } = makeIngredientProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();

    await vi.waitFor(() => expect(onFill).toHaveBeenCalledTimes(1));
    const call = onFill.mock.calls[0][0] as RunParams;
    expect(call.target).toBeUndefined();
    expect(call.sourceContext).toMatchObject({ kind: "sibling-locale" });
  });

  test("does not show slug input step", async () => {
    const { props } = makeIngredientProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();

    await expect
      .element(screen.getByRole("button", { name: /accept all & save draft/i }))
      .toBeVisible();
    await expect.element(screen.getByText(/confirm slug/i)).not.toBeInTheDocument();
  });

  test("goes directly to review after single fill", async () => {
    const { props } = makeIngredientProps();
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();

    await expect
      .element(screen.getByRole("button", { name: /accept all & save draft/i }))
      .toBeVisible();
  });
});

// ── Review step ───────────────────────────────────────────────────────────────

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
    const screen = await render(<TranslateEntityDialog {...props} />);
    await screen.getByRole("button", { name: /start translation/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /accept all & save draft/i }))
      .toBeVisible();
    return { onCreate, onFill: mockOnFill, screen };
  }

  test("shows 'Accept all & save draft' as primary CTA", async () => {
    const { screen } = await renderAtReview();
    await expect
      .element(screen.getByRole("button", { name: /accept all & save draft/i }))
      .toBeVisible();
  });

  test("shows 'Review N fields' disclosure button", async () => {
    const { screen } = await renderAtReview();
    await expect.element(screen.getByRole("button", { name: /review \d+ fields/i })).toBeVisible();
  });

  test("expands per-field review when disclosure is clicked", async () => {
    const { screen } = await renderAtReview();
    await screen.getByRole("button", { name: /review \d+ fields/i }).click();
    await expect.element(screen.getByText("Kardamom")).toBeVisible();
  });

  test("shows source-locale content in sourceSlot when review is expanded", async () => {
    const { screen } = await renderAtReview();
    await screen.getByRole("button", { name: /review \d+ fields/i }).click();
    await expect.element(screen.getByText("Cardamom")).toBeVisible();
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
    const screen = await render(<TranslateEntityDialog {...props} />);

    await screen.getByRole("button", { name: /start translation/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /accept all & save draft/i }))
      .toBeVisible();
    await screen.getByRole("button", { name: /accept all & save draft/i }).click();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
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
    await vi.waitFor(() =>
      expect(aiEventLog.append).toHaveBeenCalledWith(
        newEntityRef,
        expect.objectContaining({ type: "ingested" }),
      ),
    );
  });
});

// ── Integration: recipe two-call ──────────────────────────────────────────────

describe("integration: recipe two-call — slug passed to onCreate", () => {
  test("calls onCreate with confirmed slug as second argument", async () => {
    const onFill = vi.fn();
    onFill
      .mockResolvedValueOnce(makeSlugResult("kardamom-kuchen-de"))
      .mockResolvedValueOnce(makeBulkResult());
    const onCheckSlugAvailable = vi.fn().mockResolvedValue(true);
    const onCreate = vi.fn().mockResolvedValue(newEntityRef);

    const screen = await render(
      <TranslateEntityDialog {...makeProps({ onFill, onCheckSlugAvailable, onCreate })} />,
    );

    await screen.getByRole("button", { name: /start translation/i }).click();
    await expect.element(screen.getByRole("button", { name: /continue/i })).toBeVisible();
    await screen.getByRole("button", { name: /continue/i }).click();
    await expect
      .element(screen.getByRole("button", { name: /accept all & save draft/i }))
      .toBeVisible();
    await screen.getByRole("button", { name: /accept all & save draft/i }).click();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    const [, slug] = onCreate.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      TranslationMeta,
    ];
    expect(slug).toBe("kardamom-kuchen-de");
  });
});

// ── sourceContext shape ───────────────────────────────────────────────────────

describe("sourceContext passed to onFill", () => {
  test("sourceContext includes sourceRef, sourceData, sourceLocale, targetLocale", async () => {
    const onFill = vi.fn().mockResolvedValue(makeIngredientBulkResult());
    const screen = await render(
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

    await screen.getByRole("button", { name: /start translation/i }).click();

    await vi.waitFor(() => expect(onFill).toHaveBeenCalled());
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
