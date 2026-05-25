import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

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
      const propDecl = new RegExp(`^\\s*${prop}\\??:`, "m");
      expect(src).not.toMatch(propDecl);
    });
  }

  test("does not render an AI suggestions section", () => {
    expect(src).not.toMatch(/AI suggestions/i);
  });
});

describe("Form callsites — no AI props passed to CompletenessPanel", () => {
  const formFiles: Array<[label: string, path: string[]]> = [
    ["RecipeForm.tsx", ["RecipeForm.tsx"]],
    ["IngredientForm.tsx", ["forms", "ingredient", "IngredientForm.tsx"]],
    ["PairingForm.tsx", ["forms", "pairing", "PairingForm.tsx"]],
  ];
  for (const [formLabel, segments] of formFiles) {
    describe(formLabel, () => {
      let src: string;

      beforeAll(async () => {
        src = await readFile(join(COMPONENTS, ...segments), "utf-8");
      });

      for (const prop of AI_PROPS) {
        test(`does not pass ${prop} to CompletenessPanel`, () => {
          const panelBlock = extractCompletenessPanelBlock(src);
          expect(panelBlock).not.toMatch(new RegExp(`\\b${prop}=`));
        });
      }
    });
  }
});

function extractCompletenessPanelBlock(src: string): string {
  const start = src.indexOf("<CompletenessPanel");
  if (start === -1) return "";
  const end = src.indexOf("/>", start);
  if (end === -1) return src.slice(start, start + 500);
  return src.slice(start, end + 2);
}
