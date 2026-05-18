import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract tests for PRE-3 — strip AI props from CompletenessPanel.
// Each test asserts source-level absence of the removed surface.

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

const AI_PROPS = [
  "aiSuggestions",
  "aiRefreshing",
  "activeProposers",
  "onRefreshSuggestions",
  "onApplySuggestion",
  "onDismissSuggestion",
];

describe("CompletenessPanel — AI props stripped", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "CompletenessPanel.tsx"), "utf-8");
  });

  for (const prop of AI_PROPS) {
    test(`Props interface does not contain ${prop}`, () => {
      // Match prop declarations in the interface block (name?: type)
      const propDecl = new RegExp(`^\\s*${prop}\\??:`, "m");
      expect(src).not.toMatch(propDecl);
    });
  }

  test("does not render an AI suggestions section", () => {
    expect(src).not.toMatch(/AI suggestions/i);
  });
});

describe("Form callsites — no AI props passed to CompletenessPanel", () => {
  for (const formFile of ["RecipeForm.tsx", "IngredientForm.tsx", "PairingForm.tsx"]) {
    describe(formFile, () => {
      let src: string;

      beforeAll(async () => {
        src = await readFile(join(COMPONENTS, formFile), "utf-8");
      });

      for (const prop of AI_PROPS) {
        test(`does not pass ${prop} to CompletenessPanel`, () => {
          // Look for the pattern inside a CompletenessPanel JSX block
          const panelBlock = extractCompletenesspanelBlock(src);
          expect(panelBlock).not.toMatch(new RegExp(`\\b${prop}=`));
        });
      }
    });
  }
});

/**
 * Extracts the JSX block for CompletenessPanel from source text.
 * Finds the opening tag and captures until the closing />.
 */
function extractCompletenesspanelBlock(src: string): string {
  const start = src.indexOf("<CompletenessPanel");
  if (start === -1) return "";
  const end = src.indexOf("/>", start);
  if (end === -1) return src.slice(start, start + 500);
  return src.slice(start, end + 2);
}
