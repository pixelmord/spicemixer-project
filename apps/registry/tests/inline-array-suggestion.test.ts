import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for the InlineArraySuggestion registry component.
// Flow-aware per-kind component for string[] fields. Reads pending suggestions
// from SuggestionFlowProvider via useFieldSuggestion and delegates the filter
// + empty-state rule to TagsSuggestionRow.

const REGISTRY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(REGISTRY_ROOT, "src", "components");

let src: string;

beforeAll(async () => {
  src = await readFile(join(COMPONENTS, "inline-array-suggestion.tsx"), "utf-8");
});

describe("InlineArraySuggestion — module contract", () => {
  test("exports InlineArraySuggestion function", () => {
    expect(src).toMatch(/^export function InlineArraySuggestion\b/m);
  });

  test("accepts fieldPath prop", () => {
    expect(src).toMatch(/fieldPath[?:]/);
  });

  test("accepts existingItems optional prop", () => {
    expect(src).toMatch(/existingItems\?/);
  });

  test("accepts onApply callback", () => {
    expect(src).toMatch(/onApply[?:]/);
  });

  test("accepts optional className", () => {
    expect(src).toMatch(/className\?/);
  });

  test("accepts optional sourceSlot for translation flows", () => {
    expect(src).toMatch(/sourceSlot\?/);
  });
});

describe("InlineArraySuggestion — flow integration", () => {
  test("uses useFieldSuggestion hook (no inline flow plumbing)", () => {
    expect(src).toMatch(/useFieldSuggestion/);
  });

  test("delegates UI to TagsSuggestionRow", () => {
    expect(src).toMatch(/TagsSuggestionRow/);
  });

  test("forwards existingItems to TagsSuggestionRow (filter lives there)", () => {
    expect(src).toMatch(/existingItems=\{existingItems\}/);
  });

  test("renders ChoiceSuggestionBlock for choice-shape suggestions", () => {
    expect(src).toMatch(/ChoiceSuggestionBlock/);
  });

  test("renders RetranslateButton for translatable fields", () => {
    expect(src).toMatch(/RetranslateButton/);
  });
});
