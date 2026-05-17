/**
 * One-shot migration: split flat pairings/<id>.json into per-locale records.
 *
 * Run with: vp dlx tsx scripts/migrate-pairings-folder-per-locale.ts
 *
 * Before: pairings/<id>.json  { ingredients: [string, string], descriptions: { en?, de? } }
 *         pairings/<id>.meta.json  legacy meta
 *
 * After:  pairings/<locale>/<id>.json  { endpoints: [...], description: string }
 *         pairings/<locale>/<id>.meta.json  { canonicalLocale, translationOf?, featured: true }
 *
 * Demo pairings confirmed by maintainer are deleted outright.
 * The migration is idempotent — running it twice produces the same final state.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Pairings confirmed by maintainer as demo/placeholder data — delete outright.
const DEMO_PAIRING_IDS = new Set(["caraway--fenugreek", "cardamom--cumin"]);

const LOCALES = ["en", "de"] as const;
type Locale = (typeof LOCALES)[number];

interface LegacyPairing {
  ingredients: [string, string];
  descriptions: Partial<Record<Locale, string>>;
}

interface PerLocalePairing {
  endpoints: [
    { collection: "ingredients"; slug: string },
    { collection: "ingredients"; slug: string },
  ];
  description: string;
}

interface PerLocaleMeta {
  draft?: boolean;
  canonicalLocale: string;
  translationOf?: string;
  featured: boolean;
}

export interface MigrationStats {
  migrated: number;
  deleted: number;
  skipped: number;
}

export async function migratePairingsPerLocale(contentRoot: string): Promise<MigrationStats> {
  const pairingsDir = join(contentRoot, "pairings");
  let migrated = 0;
  let deleted = 0;
  let skipped = 0;

  let entries;
  try {
    entries = await readdir(pairingsDir, { withFileTypes: true });
  } catch {
    return { migrated, deleted, skipped };
  }

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (entry.name.endsWith(".meta.json")) continue;
    if (!entry.name.endsWith(".json")) continue;

    const id = entry.name.slice(0, -".json".length);
    const srcContent = join(pairingsDir, entry.name);
    const srcMeta = join(pairingsDir, `${id}.meta.json`);

    // Demo pairings — delete outright (maintainer confirmed)
    if (DEMO_PAIRING_IDS.has(id)) {
      await rm(srcContent, { force: true });
      await rm(srcMeta, { force: true });
      console.log(`  ✗  Deleted demo pairing: ${id}`);
      deleted++;
      continue;
    }

    const raw = await readFile(srcContent, "utf-8");
    const data = JSON.parse(raw) as LegacyPairing;

    let oldMeta: Record<string, unknown> = {};
    try {
      oldMeta = JSON.parse(await readFile(srcMeta, "utf-8")) as Record<string, unknown>;
    } catch {
      // missing meta is fine — defaults apply
    }

    const [slugA, slugB] = data.ingredients;
    const descriptions = data.descriptions;

    // Prefer 'en' as canonical; fall back to 'de' for DE-only pairings.
    const canonicalLocale: Locale = descriptions.en ? "en" : "de";
    const populatedLocales = LOCALES.filter((l) => descriptions[l]);

    let anyCreated = false;

    for (const locale of populatedLocales) {
      const localeDir = join(pairingsDir, locale);
      const destContent = join(localeDir, entry.name);
      const destMeta = join(localeDir, `${id}.meta.json`);

      if (existsSync(destContent)) {
        console.log(`  ↩  ${locale}/${id} already migrated, skipping`);
        skipped++;
        continue;
      }

      await mkdir(localeDir, { recursive: true });

      const newContent: PerLocalePairing = {
        endpoints: [
          { collection: "ingredients", slug: slugA },
          { collection: "ingredients", slug: slugB },
        ],
        description: descriptions[locale]!,
      };
      await writeFile(destContent, JSON.stringify(newContent, null, 2) + "\n", "utf-8");

      const newMeta: PerLocaleMeta = {
        ...(oldMeta["draft"] === true ? { draft: true } : {}),
        canonicalLocale,
        ...(locale !== canonicalLocale ? { translationOf: id } : {}),
        featured: true,
      };
      await writeFile(destMeta, JSON.stringify(newMeta, null, 2) + "\n", "utf-8");

      console.log(`  ✓  ${locale}/${id}`);
      anyCreated = true;
    }

    // Remove original flat files (force: true is idempotent if already gone)
    await rm(srcContent, { force: true });
    await rm(srcMeta, { force: true });
    if (anyCreated) migrated++;
  }

  return { migrated, deleted, skipped };
}

/**
 * Inverse of migratePairingsPerLocale — reconstructs flat inline shape from per-locale records.
 * Proof of reversibility; not intended for production use.
 */
export async function revertPairingsPerLocale(contentRoot: string): Promise<void> {
  const pairingsDir = join(contentRoot, "pairings");

  for (const locale of LOCALES) {
    const localeDir = join(pairingsDir, locale);
    let entries;
    try {
      entries = await readdir(localeDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.endsWith(".meta.json")) continue;
      if (!entry.name.endsWith(".json")) continue;

      const id = entry.name.slice(0, -".json".length);
      const srcContent = join(localeDir, entry.name);
      const flat = join(pairingsDir, entry.name);
      const flatMeta = join(pairingsDir, `${id}.meta.json`);

      const parsed = JSON.parse(await readFile(srcContent, "utf-8")) as PerLocalePairing;
      const ingredients = parsed.endpoints.map((e) => e.slug) as [string, string];

      let existing: LegacyPairing = { ingredients, descriptions: {} };
      if (existsSync(flat)) {
        existing = JSON.parse(await readFile(flat, "utf-8")) as LegacyPairing;
      }

      existing.descriptions[locale] = parsed.description;
      await writeFile(flat, JSON.stringify(existing, null, 2) + "\n", "utf-8");

      // Write or merge meta — restore draft flag if present
      const localeMeta = JSON.parse(
        await readFile(join(localeDir, `${id}.meta.json`), "utf-8"),
      ) as PerLocaleMeta;
      const flatMetaData: Record<string, unknown> = existsSync(flatMeta)
        ? (JSON.parse(await readFile(flatMeta, "utf-8")) as Record<string, unknown>)
        : {};
      if (localeMeta.draft) flatMetaData["draft"] = true;
      await writeFile(flatMeta, JSON.stringify(flatMetaData, null, 2) + "\n", "utf-8");

      await rm(srcContent, { force: true });
      await rm(join(localeDir, `${id}.meta.json`), { force: true });
    }
  }
}

async function main() {
  const contentRoot = new URL("../src/content", import.meta.url).pathname;
  console.log("Migrating pairings to folder-per-locale layout...\n");
  const stats = await migratePairingsPerLocale(contentRoot);
  console.log(
    `\nDone. ${stats.migrated} pairings migrated, ${stats.deleted} demo pairings deleted, ${stats.skipped} locale files skipped.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
