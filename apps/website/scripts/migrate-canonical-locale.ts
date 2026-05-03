/**
 * One-shot migration: backfill canonicalLocale on all legacy meta sidecars.
 *
 * Run with: vp dlx tsx scripts/migrate-canonical-locale.ts
 *
 * For each ingredient meta (ingredients/en/slug.meta.json, de/slug.meta.json):
 *   - Set canonicalLocale from the locale directory name if absent.
 * For each recipe and mixture meta (recipes/slug.meta.json, mixtures/slug.meta.json):
 *   - Set canonicalLocale from the `locale` field, then `language` field, then "en".
 * Pairings are skipped entirely (documented exception per ADR 0003).
 * translationStaleSince and canonicalContentHash are never written.
 *
 * The migration is idempotent — running it twice has no side effects.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function walkMetaFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMetaFiles(full)));
    } else if (entry.name.endsWith(".meta.json")) {
      files.push(full);
    }
  }
  return files;
}

export interface BackfillStats {
  updated: number;
  skipped: number;
}

export async function backfillCanonicalLocale(contentRoot: string): Promise<BackfillStats> {
  let updated = 0;
  let skipped = 0;

  // Ingredients: infer locale from parent directory (en/ or de/)
  const ingredientsDir = join(contentRoot, "ingredients");
  const ingredientMetas = await walkMetaFiles(ingredientsDir);
  for (const file of ingredientMetas) {
    const relative = file.slice(ingredientsDir.length + 1);
    const match = /^([a-z]{2})\//.exec(relative);
    if (!match) continue;
    const locale = match[1];

    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;

    if (data["canonicalLocale"] !== undefined) {
      skipped++;
      continue;
    }

    data["canonicalLocale"] = locale;
    await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log(`  ✓  ${relative} → canonicalLocale: ${locale}`);
    updated++;
  }

  // Recipes and mixtures: infer locale from inline fields
  for (const collection of ["recipes", "mixtures"] as const) {
    const dir = join(contentRoot, collection);
    const metas = await walkMetaFiles(dir);
    for (const file of metas) {
      const raw = await readFile(file, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;

      if (data["canonicalLocale"] !== undefined) {
        skipped++;
        continue;
      }

      const locale =
        (data["locale"] as string | undefined) ?? (data["language"] as string | undefined) ?? "en";

      data["canonicalLocale"] = locale;
      await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
      const name = file.split("/").pop();
      console.log(`  ✓  ${collection}/${name} → canonicalLocale: ${locale}`);
      updated++;
    }
  }

  return { updated, skipped };
}

async function main() {
  const contentRoot = new URL("../src/content", import.meta.url).pathname;
  console.log(`Backfilling canonicalLocale in ${contentRoot}`);
  const { updated, skipped } = await backfillCanonicalLocale(contentRoot);
  console.log(`\nDone. ${updated} entries updated, ${skipped} already had canonicalLocale.`);
}

// Only execute when run directly (not when imported in tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
