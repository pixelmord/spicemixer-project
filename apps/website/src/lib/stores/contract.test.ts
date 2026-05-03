import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

// This file lives at src/lib/stores/; SRC_ROOT is src/
const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const FORBIDDEN_MODULES = ["fs/promises", "node:fs", "node:fs/promises", "node:path"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineHasBypass(line: string): boolean {
  for (const mod of FORBIDDEN_MODULES) {
    const re = new RegExp(`(?:from\\s+|import\\s*\\(|require\\s*\\()\\s*['"]${escapeRe(mod)}['"]`);
    if (re.test(line)) return true;
  }
  return false;
}

async function* walkSrc(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSrc(fullPath);
    } else if (/\.(ts|tsx|astro)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

function isExcluded(filePath: string): boolean {
  const rel = relative(SRC_ROOT, filePath);
  if (rel.startsWith("lib/stores/")) return true;
  if (/\.(test|spec)\.(ts|tsx)$/.test(filePath)) return true;
  return false;
}

describe("ContentStore bypass-rule contract", () => {
  test("no source file outside lib/stores imports node:fs, node:fs/promises, fs/promises, or node:path", async () => {
    const violations: string[] = [];

    for await (const filePath of walkSrc(SRC_ROOT)) {
      if (isExcluded(filePath)) continue;
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lineHasBypass(lines[i])) {
          violations.push(`${relative(SRC_ROOT, filePath)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    expect(
      violations,
      `ContentStore bypass detected — direct fs/path imports outside lib/stores/:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});
