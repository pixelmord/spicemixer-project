import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for issue #153 — RecipeForm adopts EntityFormLayout + FieldWithSibling.
// Each test asserts that the form source contains the expected patterns.

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

let src: string;

beforeAll(async () => {
  src = await readFile(join(COMPONENTS, "RecipeForm.tsx"), "utf-8");
});

describe("RecipeForm — EntityFormLayout adoption", () => {
  test("imports EntityFormLayout", () => {
    expect(src).toMatch(/EntityFormLayout/);
  });

  test("does not directly import FieldWithSibling (all text fields use field components now)", () => {
    expect(src).not.toMatch(/^import.*FieldWithSibling/m);
  });

  test("imports useSplitViewPreference", () => {
    expect(src).toMatch(/useSplitViewPreference/);
  });

  test("imports getSiblingEntity", () => {
    expect(src).toMatch(/getSiblingEntity/);
  });

  test("uses EntityFormLayout in JSX", () => {
    expect(src).toMatch(/<EntityFormLayout/);
  });

  test("passes splitView prop to EntityFormLayout", () => {
    expect(src).toMatch(/splitView=\{/);
  });

  test("passes onToggleSplitView to EntityFormLayout", () => {
    expect(src).toMatch(/onToggleSplitView/);
  });

  test("passes overflowMenuItems to EntityFormLayout", () => {
    expect(src).toMatch(/overflowMenuItems/);
  });

  test("overflow menu includes Delete action", () => {
    expect(src).toMatch(/[Dd]elete/);
  });

  test("overflow menu includes View public page action", () => {
    expect(src).toMatch(/[Pp]ublic/);
  });
});

describe("RecipeForm — TextareaField / TextField for translatable text fields", () => {
  test("imports TextareaField from fields", () => {
    expect(src).toMatch(/TextareaField/);
  });

  test("imports TextField from fields", () => {
    expect(src).toMatch(/TextField/);
  });

  test("uses TextareaField for description field", () => {
    expect(src).toMatch(
      /<TextareaField[^>]*suggestionPath="description"|suggestionPath="description"[^>]*TextareaField/s,
    );
  });

  test("uses TextField for recipeCategory field", () => {
    expect(src).toMatch(
      /<TextField[^>]*suggestionPath="recipeCategory"|suggestionPath="recipeCategory"[^>]*TextField/s,
    );
  });

  test("uses TextField for recipeCuisine field", () => {
    expect(src).toMatch(
      /<TextField[^>]*suggestionPath="recipeCuisine"|suggestionPath="recipeCuisine"[^>]*TextField/s,
    );
  });

  test("TextareaField/TextField receive splitView prop for translatable fields", () => {
    expect(src).toMatch(/TextareaField[^/]*splitView|TextField[^/]*splitView/s);
  });

  test("name field uses TextField with suggestionPath (AI button in label row, consistent layout)", () => {
    expect(src).toMatch(/TextField[^>]*suggestionPath="name"|suggestionPath="name"[^>]*TextField/s);
  });
});

describe("RecipeForm — translate trigger in header", () => {
  test("translate trigger is moved into headerAuxiliary or header (not publishing section)", () => {
    // The translate open handler should be wired to the header auxiliary, not only
    // inside the metadata/publishing section's language label.
    expect(src).toMatch(/headerAuxiliary/);
  });

  test("language picker in publishing section is read-only display, not an editable Select", () => {
    // The language Select should no longer be a full editing affordance in the publishing section.
    // It becomes a read-only chip/display element.
    // We verify by checking that language picker is shown as read-only near the language label.
    expect(src).toMatch(
      /language.*read-only|read-only.*language|readOnly|locale.*chip|[Ll]anguage.*[Cc]hip/s,
    );
  });
});

describe("RecipeForm — subHeaderStrip mode switching", () => {
  test("imports AiBulkSuggestButton", () => {
    expect(src).toMatch(/AiBulkSuggestButton/);
  });

  test("imports AiBulkTranslateButton", () => {
    expect(src).toMatch(/AiBulkTranslateButton/);
  });

  test("renders AiBulkSuggestButton in subHeaderStrip for single-edit mode", () => {
    expect(src).toMatch(/<AiBulkSuggestButton/);
  });

  test("renders AiBulkTranslateButton in subHeaderStrip for split-view mode", () => {
    expect(src).toMatch(/<AiBulkTranslateButton/);
  });

  test("subHeaderStrip switches between suggest and translate buttons based on splitView", () => {
    // The strip should conditionally render suggest vs. translate based on splitView
    expect(src).toMatch(/splitView.*AiBulkTranslateButton|AiBulkTranslateButton.*splitView/s);
  });
});

describe("RecipeForm — per-field AI buttons handled by field components", () => {
  // AI button switching (suggest vs translate) is now encapsulated in TextareaField/TextField.
  // RecipeForm passes `splitView` to the field components; no direct button rendering needed.

  test("does not directly render AiFieldSuggestButton for description (handled by TextareaField)", () => {
    expect(src).not.toMatch(/<AiFieldSuggestButton[^>]*fieldPath="description"/s);
  });

  test("does not directly render AiFieldTranslateButton for description (handled by TextareaField)", () => {
    expect(src).not.toMatch(/<AiFieldTranslateButton[^>]*fieldPath="description"/s);
  });

  test("does not directly render AiFieldSuggestButton for recipeCategory (handled by TextField)", () => {
    expect(src).not.toMatch(/<AiFieldSuggestButton[^>]*fieldPath="recipeCategory"/s);
  });

  test("does not directly render AiFieldTranslateButton for recipeCategory (handled by TextField)", () => {
    expect(src).not.toMatch(/<AiFieldTranslateButton[^>]*fieldPath="recipeCategory"/s);
  });

  test("does not directly render AiFieldSuggestButton for recipeCuisine (handled by TextField)", () => {
    expect(src).not.toMatch(/<AiFieldSuggestButton[^>]*fieldPath="recipeCuisine"/s);
  });

  test("does not directly render AiFieldTranslateButton for recipeCuisine (handled by TextField)", () => {
    expect(src).not.toMatch(/<AiFieldTranslateButton[^>]*fieldPath="recipeCuisine"/s);
  });
});

describe("RecipeForm — sibling data fetching", () => {
  test("uses getSiblingEntity for sibling data resolution", () => {
    expect(src).toMatch(/getSiblingEntity/);
  });

  test("sibling data fetched with kind recipe or mixture", () => {
    expect(src).toMatch(/getSiblingEntity.*kind.*entityKind|entityKind.*getSiblingEntity/s);
  });
});
