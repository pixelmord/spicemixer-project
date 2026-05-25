import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for issue #152 — IngredientForm adopts EntityFormLayout + FieldWithSibling.

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

describe("IngredientForm — EntityFormLayout migration", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "IngredientForm.tsx"), "utf-8");
  });

  // ── Old scaffolding removed ──────────────────────────────────────────────

  test("does not import TranslationCompanion", () => {
    expect(src).not.toMatch(/import.*TranslationCompanion/);
  });

  test("does not use FieldWithTranslation in JSX", () => {
    expect(src).not.toMatch(/<FieldWithTranslation/);
  });

  test("does not render TranslationCompanion in JSX", () => {
    expect(src).not.toMatch(/<TranslationCompanion/);
  });

  // ── New layout shell ─────────────────────────────────────────────────────

  test("imports EntityFormLayout", () => {
    expect(src).toMatch(/import.*EntityFormLayout.*from.*EntityFormLayout/);
  });

  test("renders EntityFormLayout in JSX", () => {
    expect(src).toMatch(/<EntityFormLayout/);
  });

  test("imports FieldWithSibling", () => {
    expect(src).toMatch(/import.*FieldWithSibling.*from.*FieldWithSibling/);
  });

  test("renders FieldWithSibling in JSX", () => {
    expect(src).toMatch(/<FieldWithSibling/);
  });

  // ── Split-view preference hook ───────────────────────────────────────────

  test("imports useSplitViewPreference", () => {
    expect(src).toMatch(/useSplitViewPreference/);
  });

  test("calls useSplitViewPreference hook", () => {
    expect(src).toMatch(/useSplitViewPreference\(\)/);
  });

  // ── Sibling data fetch ───────────────────────────────────────────────────

  test("imports getSiblingEntity", () => {
    expect(src).toMatch(/getSiblingEntity/);
  });

  // ── AI bulk buttons in subHeaderStrip ───────────────────────────────────

  test("imports AiBulkSuggestButton", () => {
    expect(src).toMatch(/AiBulkSuggestButton/);
  });

  test("renders AiBulkSuggestButton", () => {
    expect(src).toMatch(/<AiBulkSuggestButton/);
  });

  test("imports AiBulkTranslateButton", () => {
    expect(src).toMatch(/AiBulkTranslateButton/);
  });

  test("renders AiBulkTranslateButton", () => {
    expect(src).toMatch(/<AiBulkTranslateButton/);
  });

  // ── Per-field AI buttons ─────────────────────────────────────────────────

  test("imports AiFieldSuggestButton", () => {
    expect(src).toMatch(/AiFieldSuggestButton/);
  });

  test("renders AiFieldSuggestButton", () => {
    expect(src).toMatch(/<AiFieldSuggestButton/);
  });

  test("imports AiFieldTranslateButton", () => {
    expect(src).toMatch(/AiFieldTranslateButton/);
  });

  test("renders AiFieldTranslateButton", () => {
    expect(src).toMatch(/<AiFieldTranslateButton/);
  });

  // ── Direct translatable fields ───────────────────────────────────────────

  // "name" still uses FieldWithSibling (special layout: translate-only, no suggest)
  test(`wraps "name" field in FieldWithSibling`, () => {
    expect(src).toMatch(new RegExp(`<FieldWithSibling[^>]*fieldKey="name"`, "s"));
  });

  // summary, description, seasonality now delegate to field components
  test("uses TextField for summary (no longer raw FieldWithSibling)", () => {
    expect(src).toMatch(
      /<TextField[^>]*suggestionPath="summary"|suggestionPath="summary"[^>]*TextField/s,
    );
  });

  test("uses TextareaField for description (no longer raw FieldWithSibling)", () => {
    expect(src).toMatch(
      /<TextareaField[^>]*suggestionPath="description"|suggestionPath="description"[^>]*TextareaField/s,
    );
  });

  test("uses TextField for seasonality (no longer raw FieldWithSibling)", () => {
    expect(src).toMatch(
      /<TextField[^>]*suggestionPath="seasonality"|suggestionPath="seasonality"[^>]*TextField/s,
    );
  });

  test("TextField/TextareaField receive splitView prop", () => {
    expect(src).toMatch(/TextareaField[^/]*splitView|TextField[^/]*splitView/s);
  });

  // Longform fields are rendered via LONGFORM_SECTIONS loop with fieldKey={key}
  const longformFields = [
    "culinaryUse",
    "medicinalUses",
    "healthBenefits",
    "safetyNotes",
    "history",
    "storage",
    "sourcing",
  ];

  test("longform fields declared in LONGFORM_SECTIONS with all translatable keys", () => {
    for (const field of longformFields) {
      expect(src).toMatch(new RegExp(`key:\\s*"${field}"`));
    }
  });

  test("longform section renders FieldWithSibling with dynamic fieldKey", () => {
    // Longform fields are rendered via a loop — fieldKey={key} is the dynamic pattern
    expect(src).toMatch(/LONGFORM_SECTIONS\.map/);
    expect(src).toMatch(/<FieldWithSibling[^>]*fieldKey=\{key\}/s);
  });

  // All 11 combined for contract completeness
  const directTranslatableFields = ["name", "summary", "description", "seasonality"];
  const translatableFields = [...directTranslatableFields, ...longformFields];

  // ── Contract fields declared on aiFlow ───────────────────────────────────

  test("aiFlow contract declares name as translatable", () => {
    expect(src).toMatch(/name.*translation.*mode.*translate|name.*mode.*translate/s);
  });

  test("aiFlow contract declares all 11 translation fields", () => {
    // All 11 translatable fields must appear in the contract object
    for (const field of translatableFields) {
      expect(src).toMatch(new RegExp(`${field}.*translation`, "s"));
    }
  });

  // ── onFill wired to aiFillTranslation ────────────────────────────────────

  test("useAiSuggestions has onFill handler", () => {
    expect(src).toMatch(/onFill:/);
  });

  // ── PairingSuggestionPanel conditioned on !splitView ────────────────────

  test("PairingSuggestionPanel is conditionally rendered based on splitView", () => {
    // Find the JSX usage (not the import). Look for the component rendered in JSX.
    const jsxIdx = src.indexOf("<PairingSuggestionPanel");
    expect(jsxIdx).toBeGreaterThan(-1);
    // The nearby context should reference splitView to gate the render
    const surrounding = src.slice(Math.max(0, jsxIdx - 400), jsxIdx + 200);
    expect(surrounding).toMatch(/splitView/);
  });
});
