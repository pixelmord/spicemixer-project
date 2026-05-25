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
    src = await readFile(join(COMPONENTS, "forms", "ingredient", "IngredientForm.tsx"), "utf-8");
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

  test("does not directly import FieldWithSibling (all fields migrated to field components)", () => {
    expect(src).not.toMatch(/^import.*FieldWithSibling/m);
  });

  test("does not render FieldWithSibling directly in JSX", () => {
    expect(src).not.toMatch(/<FieldWithSibling/);
  });

  // ── Split-view preference hook ───────────────────────────────────────────

  test("imports useSplitViewPreference", () => {
    expect(src).toMatch(/useSplitViewPreference/);
  });

  test("calls useSplitViewPreference hook", () => {
    expect(src).toMatch(/useSplitViewPreference\(\)/);
  });

  // ── Sibling data fetch ───────────────────────────────────────────────────
  // Encapsulated in the useSiblingEntity hook (forms moved off the inline
  // useEffect + getSiblingEntity call).

  test("uses the useSiblingEntity hook", () => {
    expect(src).toMatch(/useSiblingEntity/);
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

  // ── Per-field AI buttons delegated to field components ──────────────────
  // AiFieldSuggestButton / AiFieldTranslateButton are no longer imported
  // directly — they are encapsulated inside TextField / TextareaField.

  test("does not directly import AiFieldSuggestButton (delegated to field components)", () => {
    expect(src).not.toMatch(/^import.*AiFieldSuggestButton/m);
  });

  test("does not directly import AiFieldTranslateButton (delegated to field components)", () => {
    expect(src).not.toMatch(/^import.*AiFieldTranslateButton/m);
  });

  // ── Section components ──────────────────────────────────────────────────
  // Per-field JSX moved into forms/ingredient/sections/*. The orchestrator
  // now imports + composes section components rather than rendering each
  // field inline.

  test("imports BasicInfoSection", () => {
    expect(src).toMatch(/BasicInfoSection/);
  });

  test("imports TaxonomySection", () => {
    expect(src).toMatch(/TaxonomySection/);
  });

  test("imports LongformSection", () => {
    expect(src).toMatch(/LongformSection/);
  });

  test("imports OriginFlavorSection", () => {
    expect(src).toMatch(/OriginFlavorSection/);
  });

  // Translation contract stays in the orchestrator's AI_CONTRACT.
  const longformFields = [
    "culinaryUse",
    "medicinalUses",
    "healthBenefits",
    "safetyNotes",
    "history",
    "storage",
    "sourcing",
  ];
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

  // ── Pairings section ────────────────────────────────────────────────────

  test("renders the shared PairingsSection component", () => {
    expect(src).toMatch(/<PairingsSection/);
  });

  test("no longer references the legacy PairingSuggestionPanel", () => {
    expect(src).not.toMatch(/PairingSuggestionPanel/);
  });
});
