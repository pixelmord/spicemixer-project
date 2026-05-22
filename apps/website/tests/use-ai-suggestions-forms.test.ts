import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for PRD 13.3 — RecipeForm + IngredientForm migrate to useAiSuggestions.
// Each test asserts that the form source contains the expected patterns.

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");
// useAiSuggestions now lives in the shared registry; the website hook file is a
// one-line re-export shim, so structural assertions must read the canonical source.
const REGISTRY_COMPONENTS = join(WEBSITE_ROOT, "..", "registry", "src", "components");

describe("IngredientForm — useAiSuggestions orchestration", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "IngredientForm.tsx"), "utf-8");
  });

  test("imports useAiSuggestions", () => {
    expect(src).toMatch(/useAiSuggestions/);
  });

  test("imports SuggestionFlowProvider", () => {
    expect(src).toMatch(/SuggestionFlowProvider/);
  });

  test("imports InlineFieldSuggestion", () => {
    expect(src).toMatch(/InlineFieldSuggestion/);
  });

  test("calls useAiSuggestions hook", () => {
    expect(src).toMatch(/useAiSuggestions\(\{/);
  });

  test("wraps JSX with SuggestionFlowProvider", () => {
    expect(src).toMatch(/<SuggestionFlowProvider/);
  });

  test("mounts InlineFieldSuggestion for summary field", () => {
    expect(src).toMatch(/InlineFieldSuggestion[^>]*fieldPath="summary"/s);
  });

  test("mounts InlineFieldSuggestion for description field", () => {
    expect(src).toMatch(/InlineFieldSuggestion[^>]*fieldPath="description"/s);
  });

  test("handleManualRefresh delegates to aiFlow.run()", () => {
    expect(src).toMatch(/aiFlow\.run\(\)/);
  });

  test("no longer maintains raw aiSuggestions improvements state", () => {
    // The raw AiSuggestionsState improvements are now managed by the hook
    expect(src).not.toMatch(/useState<AiSuggestionsState>/);
  });

  test("no longer uses InlineSuggestion component for AI-managed fields", () => {
    // InlineSuggestion was replaced by InlineFieldSuggestion for summary and description
    // The file may still import InlineSuggestion (for other uses) but should not
    // render it for the AI-hook-managed fields (summary/description)
    const summaryBlock = extractFieldBlock(src, "summary");
    expect(summaryBlock).not.toMatch(/<InlineSuggestion/);
    const descriptionBlock = extractFieldBlock(src, "description");
    expect(descriptionBlock).not.toMatch(/<InlineSuggestion/);
  });

  test("sets up aiEventLog via useMemo", () => {
    expect(src).toMatch(/aiEventLog.*=.*useMemo|useMemo.*aiEventLog/s);
  });
});

describe("IngredientForm — PairingSuggestionPanel callsite", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "IngredientForm.tsx"), "utf-8");
  });

  test("imports PairingSuggestionPanel", () => {
    expect(src).toMatch(/import.*PairingSuggestionPanel.*from.*PairingSuggestionPanel/);
  });

  test("mounts PairingSuggestionPanel", () => {
    expect(src).toMatch(/<PairingSuggestionPanel/);
  });

  test("does not reference AiAssistPanel", () => {
    expect(src).not.toMatch(/AiAssistPanel/);
  });
});

describe("PairingForm — useAiSuggestions orchestration", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "PairingForm.tsx"), "utf-8");
  });

  test("imports useAiSuggestions", () => {
    expect(src).toMatch(/useAiSuggestions/);
  });

  test("imports SuggestionFlowProvider", () => {
    expect(src).toMatch(/SuggestionFlowProvider/);
  });

  test("imports InlineFieldSuggestion", () => {
    expect(src).toMatch(/InlineFieldSuggestion/);
  });

  test("calls useAiSuggestions hook", () => {
    expect(src).toMatch(/useAiSuggestions\(\{/);
  });

  test("wraps JSX with SuggestionFlowProvider", () => {
    expect(src).toMatch(/<SuggestionFlowProvider/);
  });

  test("mounts InlineFieldSuggestion for description field", () => {
    expect(src).toMatch(/InlineFieldSuggestion[^>]*fieldPath="description"/s);
  });

  test("handleManualRefresh delegates to aiFlow.run()", () => {
    expect(src).toMatch(/aiFlow\.run\(\)/);
  });

  test("no longer maintains raw aiSuggestions array state", () => {
    expect(src).not.toMatch(/useState<AiSuggestion\[\]>/);
  });

  test("sets up aiEventLog via useMemo", () => {
    expect(src).toMatch(/aiEventLog.*=.*useMemo|useMemo.*aiEventLog/s);
  });
});

describe("RecipeForm — useAiSuggestions integration verification", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "RecipeForm.tsx"), "utf-8");
  });

  test("imports useAiSuggestions", () => {
    expect(src).toMatch(/useAiSuggestions/);
  });

  test("imports SuggestionFlowProvider", () => {
    expect(src).toMatch(/SuggestionFlowProvider/);
  });

  test("imports InlineFieldSuggestion", () => {
    expect(src).toMatch(/InlineFieldSuggestion/);
  });

  test("calls useAiSuggestions hook", () => {
    expect(src).toMatch(/useAiSuggestions\(\{/);
  });

  test("wraps JSX with SuggestionFlowProvider", () => {
    expect(src).toMatch(/<SuggestionFlowProvider/);
  });

  test("handleManualRefresh delegates to aiFlow.run()", () => {
    expect(src).toMatch(/aiFlow\.run\(\)/);
  });

  test("mounts InlineFieldSuggestion for description field", () => {
    expect(src).toMatch(/InlineFieldSuggestion[^>]*fieldPath="description"/s);
  });

  test("mounts InlineFieldSuggestion for tags field", () => {
    expect(src).toMatch(
      /InlineFieldSuggestion[^>]*fieldPath="tags"|fieldPath="tags"[^>]*InlineFieldSuggestion/s,
    );
  });
});

describe("useAiSuggestions hook — module contract", () => {
  let hookSrc: string;

  beforeAll(async () => {
    hookSrc = await readFile(join(REGISTRY_COMPONENTS, "use-ai-suggestions.tsx"), "utf-8");
  });

  test("exports useAiSuggestions function", () => {
    expect(hookSrc).toMatch(/^export function useAiSuggestions\(/m);
  });

  test("exports UseAiSuggestionsReturn interface", () => {
    expect(hookSrc).toMatch(/^export interface UseAiSuggestionsReturn/m);
  });

  test("exports FieldSuggestion type", () => {
    expect(hookSrc).toMatch(/^export type FieldSuggestion/m);
  });

  test("exposes run() method in return", () => {
    expect(hookSrc).toMatch(/run\b.*Promise<void>|run:\s/);
  });

  test("exposes forField() method that returns PerFieldAccessor", () => {
    expect(hookSrc).toMatch(/forField\(field: FieldPath\): PerFieldAccessor/);
  });

  test("recordAccept logs to aiEventLog", () => {
    expect(hookSrc).toMatch(/aiEventLog\.append/);
    expect(hookSrc).toMatch(/type.*"accepted"/);
  });

  test("recordReject logs to aiEventLog", () => {
    expect(hookSrc).toMatch(/type.*"rejected"/);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts a rough block of JSX around a form.Field for the given field name.
 * Used to verify per-field component usage without cross-field false positives.
 */
function extractFieldBlock(src: string, fieldName: string): string {
  const marker = `form.Field name="${fieldName}"`;
  const start = src.indexOf(marker);
  if (start === -1) return "";
  // Take the next ~400 chars as a rough field block
  return src.slice(start, start + 400);
}
