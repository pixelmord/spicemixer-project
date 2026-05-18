import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("POST-3: RecipeEnhancePage and /enhance routes deleted", () => {
  test("RecipeEnhancePage.tsx does not exist", async () => {
    const path = join(WEBSITE_ROOT, "src", "components", "admin", "RecipeEnhancePage.tsx");
    expect(await fileExists(path)).toBe(false);
  });

  test("recipes/[slug]/enhance.astro does not exist", async () => {
    const path = join(WEBSITE_ROOT, "src", "pages", "admin", "recipes", "[slug]", "enhance.astro");
    expect(await fileExists(path)).toBe(false);
  });

  test("mixtures/[slug]/enhance.astro does not exist", async () => {
    const path = join(WEBSITE_ROOT, "src", "pages", "admin", "mixtures", "[slug]", "enhance.astro");
    expect(await fileExists(path)).toBe(false);
  });
});
