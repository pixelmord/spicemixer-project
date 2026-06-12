import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";
import type {
  AiContract,
  FieldConfig,
  FieldPath,
  Preset,
  PromptContext,
  ResolvedPreset,
} from "../src/contract.ts";
import type { Origin } from "../src/origin.ts";

const recipeSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

type RecipeSchema = typeof recipeSchema;

describe("AiContract type validity", () => {
  test("minimal contract with empty presets and fields compiles", () => {
    const contract: AiContract<RecipeSchema> = {
      schema: recipeSchema,
      presets: [],
      fields: {},
    };
    expect(contract.schema).toBe(recipeSchema);
    expect(contract.presets).toEqual([]);
    expect(contract.fields).toEqual({});
  });

  test("contract with field configs is accepted", () => {
    const fieldConfig: FieldConfig<RecipeSchema> = {
      systemPrompt: () => "Suggest a name for this recipe.",
      autoApply: { policy: "high-confidence", threshold: 0.85 },
      presetIds: ["expand"],
      translation: { mode: "translate" },
    };
    const contract: AiContract<RecipeSchema> = {
      schema: recipeSchema,
      presets: [],
      fields: { name: fieldConfig },
    };
    expect(contract.fields["name"]).toEqual(fieldConfig);
  });

  test("FieldConfig with only translation is valid (transition period)", () => {
    const config: FieldConfig = {
      translation: { mode: "copy" },
    };
    expect(config.translation).toEqual({ mode: "copy" });
  });

  test("Preset shape is accepted", () => {
    const preset: Preset<RecipeSchema> = {
      id: "expand",
      label: "Expand description",
      instruction: "Write a detailed description.",
      appliesTo: "text",
    };
    expect(preset.id).toBe("expand");
  });

  test("Preset with dynamic instruction is accepted", () => {
    const preset: Preset<RecipeSchema> = {
      id: "context-aware",
      label: "Context-aware suggestion",
      instruction: (ctx) => `Suggest based on: ${ctx.userPrompt ?? "no prompt"}`,
      appliesTo: "all",
      autoApplyOverride: { policy: "never" },
    };
    expect(typeof preset.instruction).toBe("function");
  });

  test("AutoApplyPolicy never variant", () => {
    const config: FieldConfig = {
      autoApply: { policy: "never" },
    };
    expect(config.autoApply).toEqual({ policy: "never" });
  });

  test("AutoApplyPolicy high-confidence variant with threshold", () => {
    const config: FieldConfig = {
      autoApply: { policy: "high-confidence", threshold: 0.9 },
    };
    expect(config.autoApply).toEqual({ policy: "high-confidence", threshold: 0.9 });
  });

  test("TranslationBehavior localize with instruction", () => {
    const config: FieldConfig = {
      translation: { mode: "localize", instruction: "Adapt for German locale." },
    };
    expect(config.translation).toEqual({
      mode: "localize",
      instruction: "Adapt for German locale.",
    });
  });
});

describe("FieldWritePolicy in FieldConfig", () => {
  test("preserve policy", () => {
    const config: FieldConfig = { writePolicy: "preserve" };
    expect(config.writePolicy).toBe("preserve");
  });

  test("merge-instructions policy", () => {
    const config: FieldConfig = {
      writePolicy: { mode: "merge-instructions", instruction: "Append new tags to existing." },
    };
    expect(config.writePolicy).toMatchObject({ mode: "merge-instructions" });
  });
});

describe("PromptContext spec", () => {
  const mockOrigin: Origin = {
    surface: "editor",
    action: "refine",
    userInitiated: true,
    runId: "run-1",
    triggeredBy: "editor",
  };

  test("PromptContext with required fields only", () => {
    const ctx: PromptContext<RecipeSchema> = {
      field: "name",
      rejectedSuggestions: [],
      origin: mockOrigin,
    };
    expect(ctx.field).toBe("name");
    expect(ctx.rejectedSuggestions).toEqual([]);
    expect(ctx.origin).toBe(mockOrigin);
  });

  test("PromptContext field is constrained to schema keys", () => {
    const field: FieldPath<RecipeSchema> = "name";
    expect(field).toBe("name");
  });

  test("PromptContext accepts optional fields", () => {
    const ctx: PromptContext<RecipeSchema> = {
      field: "description",
      currentData: { name: "Cumin" },
      userPrompt: "Be concise",
      rejectedSuggestions: [
        { fieldPath: "description", summary: "Too vague", at: "2026-01-01T00:00:00Z" },
      ],
      origin: mockOrigin,
    };
    expect(ctx.currentData?.name).toBe("Cumin");
    expect(ctx.rejectedSuggestions).toHaveLength(1);
  });

  test("PromptContext preset accepts a ResolvedPreset object or a string id", () => {
    const resolvedPreset: ResolvedPreset = {
      id: "expand",
      label: "Expand description",
      instruction: "Write a detailed description.",
      appliesTo: "text",
    };
    const ctx: PromptContext<RecipeSchema> = {
      field: "description",
      preset: resolvedPreset,
      rejectedSuggestions: [],
      origin: mockOrigin,
    };
    // preset is `string | ResolvedPreset` — narrow before reading object fields.
    const preset = ctx.preset;
    expect(typeof preset === "object" && preset.id).toBe("expand");
    expect(typeof preset === "object" && preset.instruction).toBe("Write a detailed description.");

    // The string-id form is also valid.
    const ctxWithStringPreset: PromptContext<RecipeSchema> = { preset: "expand" };
    expect(ctxWithStringPreset.preset).toBe("expand");
  });
});
