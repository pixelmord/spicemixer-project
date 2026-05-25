/**
 * Data-integrity regression guard for ingredient JSON files.
 *
 * Each JSON file in src/content/ingredients/ must parse cleanly against
 * ingredientSchema and always yield `images` as an array (never undefined).
 *
 * This catches two failure modes:
 *  1. Missing required/optional fields that should carry a Zod default.
 *  2. Content authored without `images: []` that would crash IngredientIndexPage
 *     if the Astro content-layer data-store cache is stale.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { ingredientSchema } from "entity-kind";

const INGREDIENTS_DIR = fileURLToPath(new URL("../../src/content/ingredients", import.meta.url));

async function loadIngredientFiles(): Promise<{ id: string; raw: unknown }[]> {
  const results: { id: string; raw: unknown }[] = [];
  const entries = await readdir(INGREDIENTS_DIR, { withFileTypes: true });
  const locales = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  for (const locale of locales) {
    const localeDir = join(INGREDIENTS_DIR, locale);
    const files = await readdir(localeDir);
    for (const file of files) {
      if (!file.endsWith(".json") || file.endsWith(".meta.json")) continue;
      const text = await readFile(join(localeDir, file), "utf-8");
      results.push({ id: `${locale}/${file.replace(".json", "")}`, raw: JSON.parse(text) });
    }
  }
  return results;
}

/**
 * Group loaded files by slug (ignoring locale prefix) for cross-locale checks.
 */
async function loadIngredientsBySlug(): Promise<
  Map<string, { locale: string; data: ReturnType<typeof ingredientSchema.parse> }[]>
> {
  const files = await loadIngredientFiles();
  const bySlug = new Map<
    string,
    { locale: string; data: ReturnType<typeof ingredientSchema.parse> }[]
  >();
  for (const { id, raw } of files) {
    const result = ingredientSchema.safeParse(raw);
    if (!result.success) continue;
    const slash = id.indexOf("/");
    const locale = id.slice(0, slash);
    const slug = id.slice(slash + 1);
    const group = bySlug.get(slug) ?? [];
    group.push({ locale, data: result.data });
    bySlug.set(slug, group);
  }
  return bySlug;
}

describe("ingredient JSON data integrity", () => {
  test("all ingredient files parse successfully against ingredientSchema", async () => {
    const files = await loadIngredientFiles();
    expect(files.length).toBeGreaterThan(0);

    const errors: string[] = [];
    for (const { id, raw } of files) {
      const result = ingredientSchema.safeParse(raw);
      if (!result.success) {
        errors.push(`${id}: ${result.error.message}`);
      }
    }
    if (errors.length) {
      throw new Error(`Schema validation failed for:\n${errors.join("\n")}`);
    }
  });

  test("parsed ingredient data always has images as an array", async () => {
    const files = await loadIngredientFiles();
    for (const { id, raw } of files) {
      const result = ingredientSchema.safeParse(raw);
      if (!result.success) continue; // covered by previous test
      expect(result.data.images, `${id} should have images array`).toBeInstanceOf(Array);
    }
  });

  test("all locale variants of the same slug share identical images and imageAttribution", async () => {
    const bySlug = await loadIngredientsBySlug();
    const mismatches: string[] = [];
    for (const [slug, variants] of bySlug) {
      if (variants.length < 2) continue;
      const [reference, ...rest] = variants;
      for (const variant of rest) {
        const imagesMatch =
          JSON.stringify(reference.data.images) === JSON.stringify(variant.data.images);
        if (!imagesMatch) {
          mismatches.push(
            `${slug}: images differ between "${reference.locale}" and "${variant.locale}"` +
              `\n  ${reference.locale}: ${JSON.stringify(reference.data.images)}` +
              `\n  ${variant.locale}: ${JSON.stringify(variant.data.images)}`,
          );
        }
        const attrMatch =
          JSON.stringify(reference.data.imageAttribution ?? null) ===
          JSON.stringify(variant.data.imageAttribution ?? null);
        if (!attrMatch) {
          mismatches.push(
            `${slug}: imageAttribution differs between "${reference.locale}" and "${variant.locale}"`,
          );
        }
      }
    }
    if (mismatches.length) {
      throw new Error(
        `Non-translatable image fields diverged across locales:\n${mismatches.join("\n")}`,
      );
    }
  });
});
