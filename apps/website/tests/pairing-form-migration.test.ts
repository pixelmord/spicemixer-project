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

describe("PairingForm — IngestDialog wiring", () => {
  test("PairingForm imports IngestDialog", () => {
    expect(src).toMatch(/import.*IngestDialog.*from/);
  });

  test("PairingForm renders IngestDialog", () => {
    expect(src).toMatch(/<IngestDialog\b/);
  });

  test("PairingForm uses useAiSuggestions hook", () => {
    expect(src).toMatch(/useAiSuggestions/);
  });

  test("PairingForm uses useIngestAction hook", () => {
    expect(src).toMatch(/useIngestAction/);
  });

  test("PairingForm uses PairingDiff as reviewChildren", () => {
    expect(src).toMatch(/PairingDiff/);
  });

  test("PairingForm persists description into form state on apply", () => {
    expect(src).toMatch(/setFieldValue.*description|description.*setFieldValue/);
  });
});
