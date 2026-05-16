import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";
import type { AiContract, FieldConfig, Preset } from "../src/contract.ts";

// ── Type validity — these compile-time checks catch regressions ───────────────
// If the imports above compile and the objects below are accepted without type
// errors the contract type invariants hold.

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
