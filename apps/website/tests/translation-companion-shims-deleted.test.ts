import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("Translation companion shims — cleanup (issue #154)", () => {
  test("TranslationCompanion.tsx is deleted", async () => {
    expect(await fileExists(join(COMPONENTS, "TranslationCompanion.tsx"))).toBe(false);
  });

  test("AiSuggestionsIndicator.tsx website shim is deleted", async () => {
    expect(await fileExists(join(COMPONENTS, "AiSuggestionsIndicator.tsx"))).toBe(false);
  });

  test("SuggestionsOptions.tsx website shim is deleted", async () => {
    expect(await fileExists(join(COMPONENTS, "SuggestionsOptions.tsx"))).toBe(false);
  });
});
