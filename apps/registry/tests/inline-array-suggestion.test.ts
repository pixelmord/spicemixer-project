import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for the InlineArraySuggestion registry component.
// This is a standalone, context-free component for "pick some / all / none" UX
// on a proposed list of string items — suitable for use in TagInputField and any
// other array field that wants a batch-suggestion affordance without the full
// SuggestionFlowProvider context.

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

  test("accepts items prop (string[])", () => {
    expect(src).toMatch(/items[?:].*string\[\]/);
  });

  test("accepts existingItems optional prop", () => {
    expect(src).toMatch(/existingItems\?/);
  });

  test("accepts onAccept callback", () => {
    expect(src).toMatch(/onAccept[?:].*string\[\]/);
  });

  test("accepts onDismiss callback", () => {
    expect(src).toMatch(/onDismiss[?:]/);
  });

  test("accepts optional className", () => {
    expect(src).toMatch(/className\?/);
  });
});

describe("InlineArraySuggestion — UX structure", () => {
  test("renders nothing when items is empty (early return)", () => {
    expect(src).toMatch(/items\.length.*0|length === 0/);
  });

  test("renders each item as a clickable button (pill)", () => {
    // Items that are not yet in existingItems should appear as buttons.
    expect(src).toMatch(/type="button"/);
    expect(src).toMatch(/onAccept/);
  });

  test("has an Add all action", () => {
    expect(src).toMatch(/[Aa]dd all/);
  });

  test("has a Dismiss action", () => {
    expect(src).toMatch(/[Dd]ismiss/);
  });

  test("Dismiss calls onDismiss", () => {
    expect(src).toMatch(/onDismiss\(\)|onClick.*onDismiss/);
  });

  test("filters out items already present in existingItems", () => {
    // Items already in the existing set should not be shown.
    expect(src).toMatch(/existingItems/);
    expect(src).toMatch(/includes|filter/);
  });
});

describe("InlineArraySuggestion — no context dependency", () => {
  test("does not import useSuggestionFlowContext", () => {
    expect(src).not.toMatch(/useSuggestionFlowContext/);
  });

  test("does not import SuggestionFlowProvider", () => {
    expect(src).not.toMatch(/^import.*SuggestionFlowProvider/m);
  });

  test("does not import useAiSuggestions", () => {
    expect(src).not.toMatch(/^import.*useAiSuggestions/m);
  });
});
