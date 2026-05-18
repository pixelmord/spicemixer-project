import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADMIN_COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

let src: string;

beforeAll(async () => {
  src = await readFile(join(ADMIN_COMPONENTS, "RecipeForm.tsx"), "utf-8");
});

describe("RecipeForm — EnhanceModal removal", () => {
  test("does not import EnhanceModal", () => {
    expect(src).not.toMatch(/import.*EnhanceModal/);
  });

  test("does not render EnhanceModal", () => {
    expect(src).not.toMatch(/<EnhanceModal/);
  });
});

describe("RecipeForm — IngestDialog wiring", () => {
  test("imports IngestDialog", () => {
    expect(src).toMatch(/import.*IngestDialog/);
  });

  test("renders IngestDialog for the enhance flow", () => {
    expect(src).toMatch(/<IngestDialog/);
  });

  test("passes onRun from useIngestAction to IngestDialog", () => {
    expect(src).toMatch(/onRun=\{ingestOnRun\}/);
  });

  test("passes reviewChildren to IngestDialog", () => {
    expect(src).toMatch(/reviewChildren=/);
  });
});

describe("RecipeForm — useIngestAction adoption", () => {
  test("imports useIngestAction from lib/ai", () => {
    expect(src).toMatch(/useIngestAction/);
    expect(src).toMatch(/use-ingest-action/);
  });

  test("calls useIngestAction with kind=recipe", () => {
    expect(src).toMatch(/useIngestAction.*kind.*recipe|kind.*recipe.*useIngestAction/s);
  });

  test("uses proposed from useIngestAction", () => {
    expect(src).toMatch(/proposed/);
  });

  test("uses clearProposed from useIngestAction", () => {
    expect(src).toMatch(/clearProposed/);
  });
});

describe("RecipeForm — RecipeDiff in review phase", () => {
  test("imports RecipeDiff", () => {
    expect(src).toMatch(/import RecipeDiff/);
  });

  test("renders RecipeDiff with existing and proposed", () => {
    expect(src).toMatch(/<RecipeDiff/);
    expect(src).toMatch(/proposed=\{/);
    expect(src).toMatch(/existing=\{/);
  });
});

describe("RecipeForm — no direct astro action for enhance", () => {
  test("does not call actions.aiMergeRecipe directly", () => {
    expect(src).not.toMatch(/actions\.aiMergeRecipe/);
  });
});
