/**
 * One-shot migration: remove deleted relation fields from recipe/mixture/ingredient meta.
 *
 * Run with: vp dlx tsx scripts/migrate-relation-taxonomy.ts
 *
 * For every recipes/<locale>/<slug>.meta.json and mixtures/<locale>/<slug>.meta.json:
 *   - Remove goesWellWith (deleted from recipeMetaSchema)
 *   - Remove usesBase (deleted from recipeMetaSchema)
 *   - Remove variantOf (deleted from recipeMetaSchema)
 *
 * For every ingredients/<locale>/<slug>.json:
 *   - Remove pairings (deleted from ingredientSchema)
 *
 * The migration is idempotent — running it twice produces the same final state.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const META_FIELDS = ["goesWellWith", "usesBase", "variantOf"] as const;

export interface MigrationStats {
  updated: number;
  skipped: number;
  nonEmptyRemoved: number;
}

function isNonEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === "object") return Object.keys(value as object).length > 0;
  return value !== undefined && value !== null && value !== "";
}

async function processMetaFile(filePath: string, stats: MigrationStats): Promise<void> {
  const raw = await readFile(filePath, "utf-8");
  const data = JSON.parse(raw) as Record<string, unknown>;

  let touched = false;
  let hadNonEmpty = false;

  for (const field of META_FIELDS) {
    if (field in data) {
      if (isNonEmpty(data[field])) {
        hadNonEmpty = true;
        console.log(`  ⚠  ${filePath}: removing non-empty ${field}`);
      }
      delete data[field];
      touched = true;
    }
  }

  if (touched) {
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    if (hadNonEmpty) stats.nonEmptyRemoved++;
    stats.updated++;
  } else {
    stats.skipped++;
  }
}

async function processIngredientFile(filePath: string, stats: MigrationStats): Promise<void> {
  const raw = await readFile(filePath, "utf-8");
  const data = JSON.parse(raw) as Record<string, unknown>;

  if (!("pairings" in data)) {
    stats.skipped++;
    return;
  }

  if (isNonEmpty(data["pairings"])) {
    console.log(`  ⚠  ${filePath}: removing non-empty pairings`);
    stats.nonEmptyRemoved++;
  }

  delete data["pairings"];
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  stats.updated++;
}

async function walkLocaleMetaFiles(collectionDir: string, stats: MigrationStats): Promise<void> {
  let locales;
  try {
    locales = await readdir(collectionDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of locales) {
    if (!entry.isDirectory()) continue;

    const localeDir = join(collectionDir, entry.name);
    let files;
    try {
      files = await readdir(localeDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.isFile()) continue;
      if (!file.name.endsWith(".meta.json")) continue;

      await processMetaFile(join(localeDir, file.name), stats);
    }
  }
}

async function walkIngredientContentFiles(
  ingredientsDir: string,
  stats: MigrationStats,
): Promise<void> {
  let locales;
  try {
    locales = await readdir(ingredientsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of locales) {
    if (!entry.isDirectory()) continue;

    const localeDir = join(ingredientsDir, entry.name);
    let files;
    try {
      files = await readdir(localeDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.isFile()) continue;
      if (file.name.endsWith(".meta.json")) continue;
      if (!file.name.endsWith(".json")) continue;

      await processIngredientFile(join(localeDir, file.name), stats);
    }
  }
}

export async function removeRelationTaxonomyFields(contentRoot: string): Promise<MigrationStats> {
  const stats: MigrationStats = { updated: 0, skipped: 0, nonEmptyRemoved: 0 };

  await walkLocaleMetaFiles(join(contentRoot, "recipes"), stats);
  await walkLocaleMetaFiles(join(contentRoot, "mixtures"), stats);
  await walkIngredientContentFiles(join(contentRoot, "ingredients"), stats);

  return stats;
}

async function main() {
  const contentRoot = new URL("../src/content", import.meta.url).pathname;
  console.log("Removing relation taxonomy fields from content...\n");
  const stats = await removeRelationTaxonomyFields(contentRoot);
  console.log(
    `\nDone. ${stats.updated} files updated, ${stats.skipped} skipped, ${stats.nonEmptyRemoved} had non-empty data removed.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
