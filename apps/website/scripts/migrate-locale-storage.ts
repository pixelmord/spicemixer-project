/**
 * ADR 0009 migration: move flat recipe/mixture files to locale subfolders.
 *
 * Run with: node --experimental-strip-types scripts/migrate-locale-storage.ts
 * Dry-run:  node --experimental-strip-types scripts/migrate-locale-storage.ts --dry-run
 *
 * Before: src/content/recipes/miso-butter-ramen.json
 *         src/content/recipes/miso-butter-ramen.meta.json
 *
 * After:  src/content/recipes/en/miso-butter-ramen.json
 *         src/content/recipes/en/miso-butter-ramen.meta.json
 *
 * Locale is read from the meta file's `locale` → `language` fields, falling
 * back to "en". Files already under a locale subfolder are skipped (idempotent).
 */
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");

export interface MigrateStats {
  moved: number;
  skipped: number;
}

async function readJsonLocale(metaPath: string): Promise<string> {
  try {
    const raw = await readFile(metaPath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    return (
      (data["locale"] as string | undefined) ?? (data["language"] as string | undefined) ?? "en"
    );
  } catch {
    return "en";
  }
}

export async function migrateCollection(collectionDir: string): Promise<MigrateStats> {
  let moved = 0;
  let skipped = 0;

  let entries;
  try {
    entries = await readdir(collectionDir, { withFileTypes: true });
  } catch {
    return { moved, skipped };
  }

  for (const entry of entries) {
    // Already a locale subfolder — skip
    if (entry.isDirectory()) continue;
    // Only move content JSON files (not *.meta.json, not the meta of pairings etc.)
    if (!entry.name.endsWith(".json") || entry.name.endsWith(".meta.json")) continue;

    const slug = basename(entry.name, ".json");
    const srcContent = join(collectionDir, entry.name);
    const srcMeta = join(collectionDir, `${slug}.meta.json`);

    const locale = await readJsonLocale(srcMeta);
    const destDir = join(collectionDir, locale);
    const destContent = join(destDir, entry.name);
    const destMeta = join(destDir, `${slug}.meta.json`);

    if (DRY_RUN) {
      console.log(`[dry-run] ${srcContent} → ${destContent}`);
      const hasMeta = await readFile(srcMeta, "utf-8")
        .then(() => true)
        .catch(() => false);
      if (hasMeta) console.log(`[dry-run] ${srcMeta} → ${destMeta}`);
      skipped++;
      continue;
    }

    await mkdir(destDir, { recursive: true });
    await rename(srcContent, destContent);
    console.log(`  ✓  ${locale}/${entry.name}`);
    moved++;

    try {
      await rename(srcMeta, destMeta);
      console.log(`  ✓  ${locale}/${slug}.meta.json`);
      moved++;
    } catch {
      // No meta file — that's OK
    }
  }

  return { moved, skipped };
}

async function main() {
  const contentRoot = fileURLToPath(new URL("../src/content", import.meta.url));
  if (DRY_RUN) console.log("Dry-run mode — no files will be moved.\n");
  let totalMoved = 0;
  for (const collection of ["recipes", "mixtures"] as const) {
    const dir = join(contentRoot, collection);
    console.log(`\nMigrating ${collection}/`);
    const { moved } = await migrateCollection(dir);
    totalMoved += moved;
  }
  if (!DRY_RUN) console.log(`\nDone. ${totalMoved} files moved.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
