/**
 * One-shot migration: promote inline ingredient pairings to first-class pairing entities.
 *
 * Run with: vp dlx tsx scripts/migrate-pairings.ts
 *
 * For each ingredient JSON (en/slug.json, de/slug.json):
 *   1. Read the `pairings` array.
 *   2. For each pairing, write content/pairings/<id>.json (skip if already exists).
 *   3. Remove the `pairings` field from the ingredient JSON.
 *
 * The migration is idempotent — running it twice has no side effects.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const CONTENT_ROOT = new URL("../src/content", import.meta.url).pathname;
const INGREDIENTS_DIR = join(CONTENT_ROOT, "ingredients");
const PAIRINGS_DIR = join(CONTENT_ROOT, "pairings");

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(full)));
    } else if (entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function pairingId(a: string, b: string): string {
  return [a, b].sort().join("--");
}

async function main() {
  await mkdir(PAIRINGS_DIR, { recursive: true });

  let ingredientsProcessed = 0;
  let pairingsCreated = 0;
  let pairingsSkipped = 0;

  const files = await walkDir(INGREDIENTS_DIR);

  for (const file of files) {
    // Only process locale-prefixed files (en/slug.json, de/slug.json)
    const relative = file.slice(INGREDIENTS_DIR.length + 1);
    if (!/^[a-z]{2}\//.test(relative)) continue;

    const localeSlug = relative.replace(/\.json$/, ""); // e.g. "en/cardamom"
    const slug = localeSlug.slice(3); // e.g. "cardamom"

    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;

    const pairings = data["pairings"];
    if (!Array.isArray(pairings) || pairings.length === 0) continue;

    console.log(`Processing ${localeSlug} (${pairings.length} pairings)`);
    ingredientsProcessed++;

    for (const p of pairings) {
      const pRec = typeof p === "object" && p !== null ? (p as Record<string, unknown>) : {};
      const pairSlug = typeof pRec["slug"] === "string" ? pRec["slug"] : "";
      const note = typeof pRec["note"] === "string" ? pRec["note"] : "";
      if (!pairSlug) continue;

      const id = pairingId(slug, pairSlug);
      const pairingFile = join(PAIRINGS_DIR, `${id}.json`);

      if (existsSync(pairingFile)) {
        console.log(`  ↩  ${id} already exists, skipping`);
        pairingsSkipped++;
        continue;
      }

      const pairingData = {
        ingredients: [slug, pairSlug].sort() as [string, string],
        descriptions: { en: note || `${slug} and ${pairSlug} pair well together.` },
      };
      await writeFile(pairingFile, JSON.stringify(pairingData, null, 2) + "\n", "utf-8");
      console.log(`  ✓  Created ${id}`);
      pairingsCreated++;
    }

    // Remove inline pairings field from ingredient JSON
    const { pairings: _removed, ...cleaned } = data as { pairings: unknown; [k: string]: unknown };
    await writeFile(file, JSON.stringify(cleaned, null, 2) + "\n", "utf-8");
    console.log(`  ✓  Removed inline pairings from ${localeSlug}`);
  }

  // Phase 2: migrate legacy `description: string` → `descriptions: { en }` on existing pairing files
  const pairingFiles = await walkDir(PAIRINGS_DIR);
  let pairingsUpgraded = 0;
  for (const file of pairingFiles) {
    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data["description"] && !data["descriptions"]) {
      data["descriptions"] = { en: data["description"] };
      delete data["description"];
      await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
      console.log(`  ✓  Upgraded ${file.split("/").pop()} (description → descriptions.en)`);
      pairingsUpgraded++;
    }
  }
  if (pairingsUpgraded > 0)
    console.log(`  ${pairingsUpgraded} pairings upgraded to descriptions map`);

  console.log(
    `\nDone. ${ingredientsProcessed} ingredients processed, ${pairingsCreated} pairings created, ${pairingsSkipped} skipped.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
