import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

let src: string;

beforeAll(async () => {
  src = await readFile(join(COMPONENTS, "PairingForm.tsx"), "utf-8");
});

describe("PairingForm — EntityFormLayout adoption", () => {
  test("imports EntityFormLayout", () => {
    expect(src).toMatch(/EntityFormLayout/);
  });

  test("renders inside EntityFormLayout", () => {
    expect(src).toMatch(/<EntityFormLayout\b/);
  });

  test("passes localeChip to EntityFormLayout", () => {
    expect(src).toMatch(/localeChip/);
  });

  test("passes overflowMenuItems to EntityFormLayout", () => {
    expect(src).toMatch(/overflowMenuItems/);
  });

  test("passes sections to EntityFormLayout", () => {
    expect(src).toMatch(/sections/);
  });

  test("subHeaderStrip is null for pairings", () => {
    // Pairings have only one translatable field so no sub-header strip
    expect(src).toMatch(/subHeaderStrip.*null|null.*subHeaderStrip/s);
  });
});

describe("PairingForm — FormActionBar footer", () => {
  test("imports FormActionBar", () => {
    expect(src).toMatch(/import.*FormActionBar.*from/);
  });

  test("renders FormActionBar", () => {
    expect(src).toMatch(/<FormActionBar\b/);
  });

  test("no longer has inline fixed save bar", () => {
    // Old pattern: fixed bottom-0 save bar with just a Button
    expect(src).not.toMatch(/fixed bottom-0.*Save|Save.*fixed bottom-0/s);
  });

  test("Delete action is in overflow menu, not in header bar", () => {
    // Delete should be in overflowMenuItems, not as a standalone header button
    expect(src).toMatch(/overflowMenuItems/);
    expect(src).toMatch(/Delete.*locale|delete.*pairing/i);
  });
});

describe("PairingForm — FieldWithSibling for description", () => {
  test("imports FieldWithSibling", () => {
    expect(src).toMatch(/FieldWithSibling/);
  });

  test("wraps description in FieldWithSibling", () => {
    expect(src).toMatch(
      /<FieldWithSibling[^>]*fieldKey="description"|fieldKey="description"[^>]*FieldWithSibling/s,
    );
  });

  test("passes splitView prop to FieldWithSibling", () => {
    expect(src).toMatch(/FieldWithSibling[^>]*splitView|splitView[^/]*FieldWithSibling/s);
  });
});

describe("PairingForm — split view", () => {
  test("imports useSplitViewPreference", () => {
    expect(src).toMatch(/useSplitViewPreference/);
  });

  test("calls useSplitViewPreference hook", () => {
    expect(src).toMatch(/useSplitViewPreference\(\)/);
  });

  test("auto-enables split view for translation drafts (translationOf)", () => {
    expect(src).toMatch(/initialTranslationOf/);
  });

  test("fetches sibling entity via getSiblingEntity", () => {
    expect(src).toMatch(/getSiblingEntity/);
  });
});

describe("PairingForm — AI field buttons", () => {
  test("imports AiFieldSuggestButton", () => {
    expect(src).toMatch(/AiFieldSuggestButton/);
  });

  test("renders AiFieldSuggestButton for description", () => {
    expect(src).toMatch(/<AiFieldSuggestButton[^>]*fieldPath="description"/s);
  });

  test("imports AiFieldTranslateButton", () => {
    expect(src).toMatch(/AiFieldTranslateButton/);
  });

  test("renders AiFieldTranslateButton for description", () => {
    expect(src).toMatch(/<AiFieldTranslateButton[^>]*fieldPath="description"/s);
  });
});
