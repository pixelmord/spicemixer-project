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
  if (value !== null && typeof value === "object") return Object.keys(value).length > 0;
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

async function walkLocaleFiles(
  collectionDir: string,
  fileFilter: (name: string) => boolean,
  processor: (filePath: string, stats: MigrationStats) => Promise<void>,
  stats: MigrationStats,
): Promise<void> {
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
      if (!fileFilter(file.name)) continue;

      await processor(join(localeDir, file.name), stats);
    }
  }
}

export async function removeRelationTaxonomyFields(contentRoot: string): Promise<MigrationStats> {
  const stats: MigrationStats = { updated: 0, skipped: 0, nonEmptyRemoved: 0 };

  const isMetaJson = (name: string) => name.endsWith(".meta.json");
  const isContentJson = (name: string) => name.endsWith(".json") && !name.endsWith(".meta.json");

  await walkLocaleFiles(join(contentRoot, "recipes"), isMetaJson, processMetaFile, stats);
  await walkLocaleFiles(join(contentRoot, "mixtures"), isMetaJson, processMetaFile, stats);
  await walkLocaleFiles(
    join(contentRoot, "ingredients"),
    isContentJson,
    processIngredientFile,
    stats,
  );

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
