/**
 * Regression guard for the externalSources → sources schema migration.
 *
 * Every meta.json under src/content/recipes and src/content/mixtures must
 * parse cleanly against recipeMetaSchema and must NOT contain the legacy
 * externalSources key.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { recipeMetaSchema } from "entity-kind";

const ROOTS = [
  fileURLToPath(new URL("../../src/content/recipes", import.meta.url)),
  fileURLToPath(new URL("../../src/content/mixtures", import.meta.url)),
];

async function loadMetaFiles(): Promise<{ id: string; raw: Record<string, unknown> }[]> {
  const results: { id: string; raw: Record<string, unknown> }[] = [];
  for (const root of ROOTS) {
    const entries = await readdir(root, { withFileTypes: true });
    const locales = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    for (const locale of locales) {
      const localeDir = join(root, locale);
      const files = await readdir(localeDir);
      for (const file of files) {
        if (!file.endsWith(".meta.json")) continue;
        const text = await readFile(join(localeDir, file), "utf-8");
        results.push({
          id: `${locale}/${file.replace(".meta.json", "")}`,
          raw: JSON.parse(text) as Record<string, unknown>,
        });
      }
    }
  }
  return results;
}

describe("recipe/mixture meta sources migration", () => {
  test("every meta.json parses against recipeMetaSchema", async () => {
    const files = await loadMetaFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const { id, raw } of files) {
      const result = recipeMetaSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`${id} failed schema: ${result.error.message}`);
      }
    }
  });

  test("no meta.json carries the legacy externalSources field", async () => {
    const files = await loadMetaFiles();
    for (const { id, raw } of files) {
      expect(raw, `${id} still has externalSources`).not.toHaveProperty("externalSources");
    }
  });
});
