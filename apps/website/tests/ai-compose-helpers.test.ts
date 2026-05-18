import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract: use-import-action must expose the decomposed helpers so
// that AiImportPage stays below cyc=15. AiAssistPanel contract tests remain.

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");
const LIB_AI = join(WEBSITE_ROOT, "src", "lib", "ai");

describe("use-import-action decomposition", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-import-action.ts"), "utf-8");
  });

  test("buildFormData is exported at module level", () => {
    expect(src).toMatch(/^export function buildFormData\(/m);
  });

  test("generateRecipe is a module-level async function", () => {
    expect(src).toMatch(/^export async function generateRecipe\(/m);
  });

  test("extractContent is a module-level async function", () => {
    expect(src).toMatch(/^export async function extractContent\(/m);
  });

  test("useImportAction is exported at module level", () => {
    expect(src).toMatch(/^export function useImportAction\(/m);
  });

  test("SourceMeta interface is exported", () => {
    expect(src).toMatch(/^export interface SourceMeta\b/m);
  });

  test("useImportAction dispatches to generateRecipe for recipe+prompt", () => {
    expect(src).toMatch(/generateRecipe\(/);
  });

  test("useImportAction dispatches to extractContent for non-prompt", () => {
    expect(src).toMatch(/extractContent\(/);
  });
});

describe("AiImportPage uses use-import-action", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "AiImportPage.tsx"), "utf-8");
  });

  test("imports useImportAction from use-import-action", () => {
    expect(src).toMatch(/useImportAction/);
    expect(src).toMatch(/use-import-action/);
  });

  test("uses FileTextPromptSourcePicker instead of SourcePicker", () => {
    expect(src).toMatch(/FileTextPromptSourcePicker/);
    expect(src).not.toMatch(/from.*SourcePicker(?!\.tsx)/);
  });

  test("uses CapabilityLabel", () => {
    expect(src).toMatch(/<CapabilityLabel/);
  });

  test("default export is AiImportPage", () => {
    expect(src).toMatch(/export default function AiImportPage/);
  });

  test("re-exports SourceMeta for downstream consumers", () => {
    expect(src).toMatch(/export.*SourceMeta.*from/);
  });
});

describe("PairingSuggestionPanel decomposition", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "PairingSuggestionPanel.tsx"), "utf-8");
  });

  test("runTags is a module-level async function", () => {
    expect(src).toMatch(/^async function runTags\(/m);
  });

  test("runImprove is a module-level async function", () => {
    expect(src).toMatch(/^async function runImprove\(/m);
  });

  test("runPairings is a module-level async function", () => {
    expect(src).toMatch(/^async function runPairings\(/m);
  });

  test("PairingSuggestionResults sub-component is defined", () => {
    expect(src).toMatch(/^function PairingSuggestionResults\(/m);
  });
});
