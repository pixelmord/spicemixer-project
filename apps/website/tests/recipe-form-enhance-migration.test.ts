import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADMIN_COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");
const RECIPE_MODALS = join(ADMIN_COMPONENTS, "forms", "recipe", "sections", "modals");

let orchestratorSrc: string;
let enhanceSrc: string;

beforeAll(async () => {
  orchestratorSrc = await readFile(join(ADMIN_COMPONENTS, "RecipeForm.tsx"), "utf-8");
  enhanceSrc = await readFile(join(RECIPE_MODALS, "RecipeEnhanceDialog.tsx"), "utf-8");
});

describe("RecipeForm — IngestDialog wiring (delegated to RecipeEnhanceDialog)", () => {
  test("RecipeForm imports RecipeEnhanceDialog", () => {
    expect(orchestratorSrc).toMatch(/RecipeEnhanceDialog/);
  });

  test("RecipeEnhanceDialog wraps IngestDialog", () => {
    expect(enhanceSrc).toMatch(/import.*IngestDialog/);
    expect(enhanceSrc).toMatch(/<IngestDialog/);
  });

  test("RecipeEnhanceDialog passes reviewChildren to IngestDialog", () => {
    expect(enhanceSrc).toMatch(/reviewChildren=/);
  });

  test("RecipeForm passes onRun from useIngestAction to RecipeEnhanceDialog", () => {
    expect(orchestratorSrc).toMatch(/onRun=\{ingestOnRun\}/);
  });
});

describe("RecipeForm — useIngestAction adoption", () => {
  test("imports useIngestAction from lib/ai", () => {
    expect(orchestratorSrc).toMatch(/useIngestAction/);
    expect(orchestratorSrc).toMatch(/use-ingest-action/);
  });

  test("calls useIngestAction with kind=recipe", () => {
    expect(orchestratorSrc).toMatch(/useIngestAction.*kind.*recipe|kind.*recipe.*useIngestAction/s);
  });

  test("uses proposed from useIngestAction", () => {
    expect(orchestratorSrc).toMatch(/proposed/);
  });

  test("uses clearProposed from useIngestAction", () => {
    expect(orchestratorSrc).toMatch(/clearProposed/);
  });
});

describe("RecipeEnhanceDialog — RecipeDiff in review phase", () => {
  test("RecipeEnhanceDialog imports RecipeDiff", () => {
    expect(enhanceSrc).toMatch(/import RecipeDiff/);
  });

  test("RecipeEnhanceDialog renders RecipeDiff with existing and proposed", () => {
    expect(enhanceSrc).toMatch(/<RecipeDiff/);
    expect(enhanceSrc).toMatch(/proposed=\{/);
    expect(enhanceSrc).toMatch(/existing=\{/);
  });
});

describe("RecipeForm — no direct astro action for enhance", () => {
  test("does not call actions.aiMergeRecipe directly", () => {
    expect(orchestratorSrc).not.toMatch(/actions\.aiMergeRecipe/);
  });
});
