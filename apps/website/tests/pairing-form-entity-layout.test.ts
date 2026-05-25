import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

let src: string;

beforeAll(async () => {
  src = await readFile(join(COMPONENTS, "forms", "pairing", "PairingForm.tsx"), "utf-8");
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

  test("uses HTML section elements to divide the form", () => {
    expect(src).toMatch(/<section\b/);
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

describe("PairingForm — TextareaField for description", () => {
  test("imports TextareaField from fields", () => {
    expect(src).toMatch(/import.*TextareaField.*from.*fields|TextareaField/);
  });

  test("uses form.Field (standard TanStack render-prop) for description", () => {
    expect(src).toMatch(/form\.Field[^>]*name="description"/s);
  });

  test("renders TextareaField inside the description field render prop", () => {
    expect(src).toMatch(/<TextareaField[^>]*|TextareaField\b/s);
  });

  test("TextareaField receives splitView prop", () => {
    expect(src).toMatch(/TextareaField[^/]*splitView|splitView[^<]*TextareaField/s);
  });

  test("TextareaField receives siblingValue prop", () => {
    expect(src).toMatch(/TextareaField[^/]*siblingValue|siblingValue[^<]*TextareaField/s);
  });

  test("TextareaField receives siblingLocale prop", () => {
    expect(src).toMatch(/TextareaField[^/]*siblingLocale|siblingLocale[^<]*TextareaField/s);
  });

  test("no longer manually wraps description in FieldWithSibling", () => {
    // FieldWithSibling layout is now inside TextareaField
    expect(src).not.toMatch(/<FieldWithSibling/);
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

  test("fetches sibling entity via the useSiblingEntity hook", () => {
    expect(src).toMatch(/useSiblingEntity/);
  });
});

describe("PairingForm — AI buttons delegated to TextareaField", () => {
  test("does not directly render AiFieldSuggestButton (handled by TextareaField)", () => {
    expect(src).not.toMatch(/<AiFieldSuggestButton/);
  });

  test("does not directly render AiFieldTranslateButton (handled by TextareaField)", () => {
    expect(src).not.toMatch(/<AiFieldTranslateButton/);
  });
});
