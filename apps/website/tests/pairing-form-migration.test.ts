import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");
const PAIRING_DIR = join(COMPONENTS, "forms", "pairing");

let src: string;
let enhanceWrapperSrc: string;

beforeAll(async () => {
  src = await readFile(join(PAIRING_DIR, "PairingForm.tsx"), "utf-8");
  enhanceWrapperSrc = await readFile(
    join(PAIRING_DIR, "sections", "modals", "PairingEnhanceDialog.tsx"),
    "utf-8",
  );
});

describe("PairingForm — Enhance dialog wiring", () => {
  test("PairingForm renders PairingEnhanceDialog wrapper", () => {
    expect(src).toMatch(/<PairingEnhanceDialog\b/);
  });

  test("Enhance wrapper imports IngestDialog from canonical location", () => {
    expect(enhanceWrapperSrc).toMatch(/import.*IngestDialog.*from/);
  });

  test("Enhance wrapper renders IngestDialog", () => {
    expect(enhanceWrapperSrc).toMatch(/<IngestDialog\b/);
  });

  test("PairingForm uses useAiSuggestions hook", () => {
    expect(src).toMatch(/useAiSuggestions/);
  });

  test("PairingForm uses useIngestAction hook", () => {
    expect(src).toMatch(/useIngestAction/);
  });

  test("Enhance wrapper uses PairingDiff as reviewChildren", () => {
    expect(enhanceWrapperSrc).toMatch(/PairingDiff/);
  });

  test("PairingForm persists description into form state on apply", () => {
    expect(src).toMatch(/setFieldValue.*description|description.*setFieldValue/);
  });
});
