import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

// Structural contract: AiComposeForm must expose the decomposed helpers so that
// handleSubmit stays below cyc=15.

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

describe("AiComposeForm decomposition", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "AiComposeForm.tsx"), "utf-8");
  });

  test("buildFormData is exported at module level", () => {
    expect(src).toMatch(/^export function buildFormData\(/m);
  });

  test("generateRecipe is a module-level async function", () => {
    expect(src).toMatch(/^async function generateRecipe\(/m);
  });

  test("extractContent is a module-level async function", () => {
    expect(src).toMatch(/^async function extractContent\(/m);
  });

  test("handleSubmit delegates to generateRecipe or extractContent without inlining action calls", () => {
    expect(src).toMatch(/await generateRecipe\(/);
    expect(src).toMatch(/await extractContent\(/);
    // The raw action calls should live in the helper functions, not directly in handleSubmit
    const handleSubmitMatch = src.match(/async function handleSubmit\(\)([\s\S]*?)^  }/m);
    expect(handleSubmitMatch).not.toBeNull();
    const handleSubmitBody = handleSubmitMatch![1];
    expect(handleSubmitBody).not.toMatch(/actions\.aiGenerateRecipe/);
    expect(handleSubmitBody).not.toMatch(/actions\.aiExtractRecipe/);
  });
});

describe("AiAssistPanel decomposition", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "AiAssistPanel.tsx"), "utf-8");
  });

  test("runLinks is a module-level async function", () => {
    expect(src).toMatch(/^async function runLinks\(/m);
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

  test("AiAssistResults sub-component is defined", () => {
    expect(src).toMatch(/^function AiAssistResults\(/m);
  });
});
