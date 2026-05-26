import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for IngredientsSection and InstructionsSection split-view affordances.
// Verifies that both sections have: translate button, side-by-side grid layout, and an inline
// suggestion panel so AI-translated lists can be accepted without any extra UI step.

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SECTIONS = join(WEBSITE_ROOT, "src", "components", "admin", "forms", "recipe", "sections");

let ingredientsSrc: string;
let instructionsSrc: string;

beforeAll(async () => {
  [ingredientsSrc, instructionsSrc] = await Promise.all([
    readFile(join(SECTIONS, "IngredientsSection.tsx"), "utf-8"),
    readFile(join(SECTIONS, "InstructionsSection.tsx"), "utf-8"),
  ]);
});

// ── IngredientsSection ────────────────────────────────────────────────────────

describe("IngredientsSection — split-view translate affordance", () => {
  test("imports AiFieldTranslateButton", () => {
    expect(ingredientsSrc).toMatch(/AiFieldTranslateButton/);
  });

  test("renders AiFieldTranslateButton for recipeIngredient field", () => {
    expect(ingredientsSrc).toMatch(/AiFieldTranslateButton[^>]*fieldPath="recipeIngredient"/s);
  });

  test("AiFieldTranslateButton is gated on splitView", () => {
    // Button must only appear in split-view translation context
    expect(ingredientsSrc).toMatch(
      /splitView[^}]*AiFieldTranslateButton|AiFieldTranslateButton[^<]*splitView/s,
    );
  });
});

describe("IngredientsSection — split-view layout", () => {
  test("uses two-column grid layout in split view", () => {
    expect(ingredientsSrc).toMatch(/grid-cols-2/);
  });

  test("sibling reference is no longer in a <details open> collapsed panel", () => {
    // Previously the sibling ingredient list was inside <details ... open>.
    // Now the reference lives in the right column of a grid, visible by default.
    expect(ingredientsSrc).not.toMatch(/<details[^>]*\bopen\b/);
  });
});

describe("IngredientsSection — inline translation suggestion", () => {
  test("imports InlineListSuggestion", () => {
    expect(ingredientsSrc).toMatch(/InlineListSuggestion/);
  });

  test("renders InlineListSuggestion targeting recipeIngredient", () => {
    expect(ingredientsSrc).toMatch(/InlineListSuggestion[^>]*fieldPath="recipeIngredient"/s);
  });
});

// ── InstructionsSection ───────────────────────────────────────────────────────

describe("InstructionsSection — split-view translate affordance", () => {
  test("imports AiFieldTranslateButton", () => {
    expect(instructionsSrc).toMatch(/AiFieldTranslateButton/);
  });

  test("renders AiFieldTranslateButton for recipeInstructions field", () => {
    expect(instructionsSrc).toMatch(/AiFieldTranslateButton[^>]*fieldPath="recipeInstructions"/s);
  });

  test("AiFieldTranslateButton is gated on splitView", () => {
    expect(instructionsSrc).toMatch(
      /splitView[^}]*AiFieldTranslateButton|AiFieldTranslateButton[^<]*splitView/s,
    );
  });
});

describe("InstructionsSection — split-view layout", () => {
  test("uses two-column grid layout in split view", () => {
    expect(instructionsSrc).toMatch(/grid-cols-2/);
  });

  test("sibling reference is no longer in a <details open> collapsed panel", () => {
    expect(instructionsSrc).not.toMatch(/<details[^>]*\bopen\b/);
  });
});

describe("InstructionsSection — inline translation suggestion", () => {
  test("imports InlineListSuggestion", () => {
    expect(instructionsSrc).toMatch(/InlineListSuggestion/);
  });

  test("renders InlineListSuggestion targeting recipeInstructions", () => {
    expect(instructionsSrc).toMatch(/InlineListSuggestion[^>]*fieldPath="recipeInstructions"/s);
  });
});
