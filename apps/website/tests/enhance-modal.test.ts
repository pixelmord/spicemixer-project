import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

describe("EnhanceModal — generic consolidation", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "EnhanceModal.tsx"), "utf-8");
  });

  test('kind discriminant covers "recipe"', () => {
    expect(src).toMatch(/kind.*"recipe"|"recipe".*kind/);
  });

  test('kind discriminant covers "ingredient"', () => {
    expect(src).toMatch(/kind.*"ingredient"|"ingredient".*kind/);
  });

  test('kind discriminant covers "pairing"', () => {
    expect(src).toMatch(/kind.*"pairing"|"pairing".*kind/);
  });

  test("dispatches aiMergeIngredient for ingredient kind", () => {
    expect(src).toMatch(/aiMergeIngredient/);
  });

  test("dispatches aiMergePairing for pairing kind", () => {
    expect(src).toMatch(/aiMergePairing/);
  });

  test("dispatches saveIngredient for ingredient kind", () => {
    expect(src).toMatch(/actions\.saveIngredient/);
  });

  test("dispatches savePairing for pairing kind", () => {
    expect(src).toMatch(/actions\.savePairing/);
  });

  test("uses IngredientDiff for ingredient kind", () => {
    expect(src).toMatch(/IngredientDiff/);
  });

  test("uses PairingDiff for pairing kind", () => {
    expect(src).toMatch(/PairingDiff/);
  });
});

describe("IngredientEnhanceModal — consolidated away", () => {
  test("IngredientEnhanceModal.tsx no longer owns modal state (source tabs)", async () => {
    let content: string;
    try {
      content = await readFile(join(COMPONENTS, "IngredientEnhanceModal.tsx"), "utf-8");
    } catch {
      // File deleted — consolidation complete
      return;
    }
    // If the file still exists it must not manage its own source/tab state
    expect(content).not.toMatch(/useState<SourceMode>/);
    expect(content).not.toMatch(/aiMergeIngredient/);
  });
});

describe("PairingEnhanceModal — consolidated away", () => {
  test("PairingEnhanceModal.tsx no longer owns modal state (source tabs)", async () => {
    let content: string;
    try {
      content = await readFile(join(COMPONENTS, "PairingEnhanceModal.tsx"), "utf-8");
    } catch {
      // File deleted — consolidation complete
      return;
    }
    // If the file still exists it must not manage its own source/tab state
    expect(content).not.toMatch(/useState<SourceMode>/);
    expect(content).not.toMatch(/aiMergePairing/);
  });
});
