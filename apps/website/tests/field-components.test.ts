import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for field component upgrades.
// Guards the consistency requirement: TextField / TextareaField / TagInputField must be the
// single composition point for label + AI buttons + input + sibling layout,
// following the standard TanStack Form render-prop API (field passed as prop).

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIELDS = join(WEBSITE_ROOT, "src", "components", "admin", "fields");

let textareaSrc: string;
let textSrc: string;

beforeAll(async () => {
  [textareaSrc, textSrc] = await Promise.all([
    readFile(join(FIELDS, "TextareaField.tsx"), "utf-8"),
    readFile(join(FIELDS, "TextField.tsx"), "utf-8"),
  ]);
});

// ── TextareaField ──────────────────────────────────────────────────────────────

describe("TextareaField — standard TanStack Form field prop API", () => {
  test("accepts field as a prop (not via useFieldContext)", () => {
    // TanStack Form docs pattern: render prop passes field to the component.
    expect(textareaSrc).toMatch(/field[?:].*FieldApi|FieldApi.*field[?:]/s);
  });

  test("does not import useFieldContext", () => {
    expect(textareaSrc).not.toMatch(/useFieldContext/);
  });

  test("reads field.name from the field prop", () => {
    expect(textareaSrc).toMatch(/field\.name/);
  });

  test("reads field.state.value from the field prop", () => {
    expect(textareaSrc).toMatch(/field\.state\.value/);
  });

  test("calls field.handleChange from the field prop", () => {
    expect(textareaSrc).toMatch(/field\.handleChange/);
  });
});

describe("TextareaField — AI button integration", () => {
  test("imports AiFieldSuggestButton from @registry", () => {
    expect(textareaSrc).toMatch(/AiFieldSuggestButton/);
  });

  test("imports AiFieldTranslateButton from @registry", () => {
    expect(textareaSrc).toMatch(/AiFieldTranslateButton/);
  });

  test("AiFieldSuggestButton is only rendered when !splitView", () => {
    expect(textareaSrc).toMatch(
      /!splitView[^}]*AiFieldSuggestButton|AiFieldSuggestButton[^<]*!splitView/s,
    );
  });

  test("AiFieldTranslateButton is only rendered when splitView", () => {
    expect(textareaSrc).toMatch(
      /\bsplitView\b[^}!]*AiFieldTranslateButton|AiFieldTranslateButton[^<]*\bsplitView\b/s,
    );
  });

  test("no longer uses the old inline Sparkles suggest button", () => {
    expect(textareaSrc).not.toMatch(/<Sparkles/);
  });
});

describe("TextareaField — split-view sibling layout", () => {
  test("accepts splitView prop", () => {
    expect(textareaSrc).toMatch(/splitView/);
  });

  test("accepts siblingValue prop", () => {
    expect(textareaSrc).toMatch(/siblingValue/);
  });

  test("accepts siblingLocale prop", () => {
    expect(textareaSrc).toMatch(/siblingLocale/);
  });

  test("renders two-column grid layout in split-view mode", () => {
    expect(textareaSrc).toMatch(/grid-cols-2/);
  });
});

// ── TextField ─────────────────────────────────────────────────────────────────

describe("TextField — standard TanStack Form field prop API", () => {
  test("accepts field as a prop (not via useFieldContext)", () => {
    expect(textSrc).toMatch(/field[?:].*FieldApi|FieldApi.*field[?:]/s);
  });

  test("does not import useFieldContext", () => {
    expect(textSrc).not.toMatch(/useFieldContext/);
  });

  test("reads field.name from the field prop", () => {
    expect(textSrc).toMatch(/field\.name/);
  });

  test("reads field.state.value from the field prop", () => {
    expect(textSrc).toMatch(/field\.state\.value/);
  });

  test("calls field.handleChange from the field prop", () => {
    expect(textSrc).toMatch(/field\.handleChange/);
  });
});

describe("TextField — AI button integration", () => {
  test("imports AiFieldSuggestButton from @registry", () => {
    expect(textSrc).toMatch(/AiFieldSuggestButton/);
  });

  test("imports AiFieldTranslateButton from @registry", () => {
    expect(textSrc).toMatch(/AiFieldTranslateButton/);
  });

  test("AiFieldSuggestButton is only rendered when !splitView", () => {
    expect(textSrc).toMatch(
      /!splitView[^}]*AiFieldSuggestButton|AiFieldSuggestButton[^<]*!splitView/s,
    );
  });

  test("AiFieldTranslateButton is only rendered when splitView", () => {
    expect(textSrc).toMatch(
      /\bsplitView\b[^}!]*AiFieldTranslateButton|AiFieldTranslateButton[^<]*\bsplitView\b/s,
    );
  });

  test("no longer uses the old inline Sparkles suggest button", () => {
    expect(textSrc).not.toMatch(/<Sparkles/);
  });
});

describe("TextField — split-view sibling layout", () => {
  test("accepts splitView prop", () => {
    expect(textSrc).toMatch(/splitView/);
  });

  test("accepts siblingValue prop", () => {
    expect(textSrc).toMatch(/siblingValue/);
  });

  test("accepts siblingLocale prop", () => {
    expect(textSrc).toMatch(/siblingLocale/);
  });

  test("renders two-column grid layout in split-view mode", () => {
    expect(textSrc).toMatch(/grid-cols-2/);
  });
});

describe("TextField — hideSuggest extension", () => {
  test("accepts hideSuggest prop", () => {
    expect(textSrc).toMatch(/hideSuggest/);
  });

  test("suppresses AiFieldSuggestButton when hideSuggest is true", () => {
    // hideSuggest blocks the suggest button even when !splitView.
    expect(textSrc).toMatch(/!hideSuggest|hideSuggest.*false/s);
  });

  test("does not have buttonPosition prop (AI button always in label row)", () => {
    expect(textSrc).not.toMatch(/buttonPosition/);
  });
});

// ── TagInputField ─────────────────────────────────────────────────────────────

describe("TagInputField — standard TanStack Form field prop API", () => {
  let tagSrc: string;

  beforeAll(async () => {
    tagSrc = await readFile(join(FIELDS, "TagInputField.tsx"), "utf-8");
  });

  test("accepts field as a prop (not via useFieldContext)", () => {
    // field.state.value is string[] (not string)
    expect(tagSrc).toMatch(/field[?:].*FieldApi|FieldApi.*field[?:]/s);
  });

  test("does not import useFieldContext", () => {
    expect(tagSrc).not.toMatch(/useFieldContext/);
  });

  test("reads field.name from the field prop", () => {
    expect(tagSrc).toMatch(/field\.name/);
  });

  test("reads field.state.value from the field prop", () => {
    expect(tagSrc).toMatch(/field\.state\.value/);
  });

  test("calls field.handleChange from the field prop", () => {
    expect(tagSrc).toMatch(/field\.handleChange/);
  });
});

describe("TagInputField — TagInput composition", () => {
  let tagSrc: string;

  beforeAll(async () => {
    tagSrc = await readFile(join(FIELDS, "TagInputField.tsx"), "utf-8");
  });

  test("imports TagInput", () => {
    expect(tagSrc).toMatch(/import.*TagInput/);
  });

  test("renders TagInput with value and onChange", () => {
    expect(tagSrc).toMatch(/<TagInput/);
    expect(tagSrc).toMatch(/onChange/);
  });

  test("passes suggestions prop through to TagInput", () => {
    expect(tagSrc).toMatch(/suggestions/);
  });
});

describe("TagInputField — AI button integration", () => {
  let tagSrc: string;

  beforeAll(async () => {
    tagSrc = await readFile(join(FIELDS, "TagInputField.tsx"), "utf-8");
  });

  test("imports AiFieldSuggestButton from @registry", () => {
    expect(tagSrc).toMatch(/AiFieldSuggestButton/);
  });

  test("imports AiFieldTranslateButton from @registry (keywords/tags are localizable)", () => {
    // TagInputField shows AiFieldTranslateButton in split view so keywords and tags
    // can be localized alongside the other translatable recipe fields.
    expect(tagSrc).toMatch(/AiFieldTranslateButton/);
  });

  test("renders AiFieldSuggestButton when suggestionPath provided", () => {
    expect(tagSrc).toMatch(/<AiFieldSuggestButton/);
  });

  test("uses dedicated InlineArraySuggestion (no dispatcher with kind prop)", () => {
    expect(tagSrc).toMatch(/InlineArraySuggestion/);
    expect(tagSrc).not.toMatch(/InlineFieldSuggestion/);
    expect(tagSrc).not.toMatch(/kind="array"/);
  });

  test("passes existingItems to InlineArraySuggestion so duplicates filter out", () => {
    expect(tagSrc).toMatch(/existingItems=\{currentValue\}/);
  });

  test("onApply merges new items with existing value (union, not replace)", () => {
    expect(tagSrc).toMatch(/new Set|\.filter|spread.*field\.state\.value/s);
  });
});

describe("TagInputField — split view + translate", () => {
  let tagSrc: string;

  beforeAll(async () => {
    tagSrc = await readFile(join(FIELDS, "TagInputField.tsx"), "utf-8");
  });

  test("supports splitView prop for translation mode", () => {
    // Keywords and tags are localizable: in split view the field shows
    // AiFieldTranslateButton and a sibling-locale reference row.
    expect(tagSrc).toMatch(/splitView/);
    expect(tagSrc).toMatch(/AiFieldTranslateButton/);
  });

  test("no dead pendingItems wiring", () => {
    // The pendingItems/onAcceptItems/onDismissItems props were vestigial state
    // that never carried real items in any call site. Removed during the
    // dispatcher-to-dedicated-components consolidation.
    expect(tagSrc).not.toMatch(/pendingItems/);
    expect(tagSrc).not.toMatch(/onAcceptItems/);
    expect(tagSrc).not.toMatch(/onDismissItems/);
  });
});
