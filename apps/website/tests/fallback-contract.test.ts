import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES_DIR = join(WEBSITE_ROOT, "src", "pages");

async function collectAstroFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectAstroFiles(full)));
    } else if (entry.name.endsWith(".astro")) {
      files.push(full);
    }
  }
  return files;
}

// Only detail pages — list/admin pages legitimately use locale-prefix filtering.
async function collectDetailPageFiles(): Promise<string[]> {
  const all = await collectAstroFiles(PAGES_DIR);
  return all.filter((f) => f.endsWith("[slug].astro"));
}

describe("Fallback contract: no inline locale branching in page templates", () => {
  test("no detail page uses e.id.startsWith() with locale prefixes", async () => {
    const files = await collectDetailPageFiles();
    const violations: string[] = [];

    for (const file of files) {
      const src = await readFile(file, "utf-8");
      const lines = src.split("\n");
      lines.forEach((line, idx) => {
        if (/\.id\.startsWith\(["'](en|de)\//.test(line)) {
          const rel = file.replace(PAGES_DIR + "/", "");
          violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} inline locale-prefix branching violation(s) in page templates.\n` +
          `Move this logic into resolvePublished (lib/published-entity.ts):\n\n` +
          violations.join("\n"),
      );
    }

    expect(violations).toHaveLength(0);
  });

  test("no detail page manually filters .draft === true (use resolvePublished instead)", async () => {
    const files = await collectDetailPageFiles();
    const violations: string[] = [];

    for (const file of files) {
      const src = await readFile(file, "utf-8");
      const lines = src.split("\n");
      lines.forEach((line, idx) => {
        if (/\.draft\s*===\s*true/.test(line)) {
          const rel = file.replace(PAGES_DIR + "/", "");
          violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} manual draft-filter violation(s) in page templates.\n` +
          `Draft filtering belongs in resolvePublished (lib/published-entity.ts):\n\n` +
          violations.join("\n"),
      );
    }

    expect(violations).toHaveLength(0);
  });
});
