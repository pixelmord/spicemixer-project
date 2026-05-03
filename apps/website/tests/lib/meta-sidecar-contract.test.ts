/**
 * Contract test: no business-logic file outside lib/meta-sidecar.ts and
 * lib/stores/** should:
 *   - construct meta keys via template literals (${collection}/${slug})
 *   - reference meta collection names as string literals ("ingredientMeta",
 *     "pairingMeta")
 *
 * If this test fails it means a file is manually routing to a meta collection
 * instead of going through MetaSidecar.
 */
import { describe, expect, test } from "vite-plus/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "../../src");

// Files / directories that are allowed to contain these patterns.
// - meta-sidecar.ts: owns the routing logic
// - lib/stores/**: file-path mappings for the disk layout
// - lib/content-store.ts: defines the Collection type union
// - content.config.ts: Astro collection definitions (framework API)
const EXCLUDED_SUFFIXES = [
  "/lib/meta-sidecar.ts",
  "/lib/meta-sidecar.test.ts",
  "/lib/content-store.ts",
  "/content.config.ts",
];
const EXCLUDED_DIRS = ["/lib/stores/"];

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkTs(full);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      yield full;
    }
  }
}

const KEY_CONSTRUCTION_RE = /\$\{[^}]*collection[^}]*\}\/\$\{[^}]*slug/;
const INGREDIENT_META_RE = /["']ingredientMeta["']/;
const PAIRING_META_RE = /["']pairingMeta["']/;

function isExcluded(filePath: string): boolean {
  const rel = "/" + relative(ROOT, filePath).replace(/\\/g, "/");
  if (EXCLUDED_DIRS.some((d) => rel.includes(d))) return true;
  if (EXCLUDED_SUFFIXES.some((s) => rel.endsWith(s))) return true;
  return false;
}

describe("MetaSidecar contract — no inline meta-key construction", () => {
  const violations: string[] = [];

  for (const filePath of walkTs(ROOT)) {
    if (isExcluded(filePath)) continue;
    const src = readFileSync(filePath, "utf-8");
    const lines = src.split("\n");
    const rel = relative(ROOT + "/..", filePath);
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (KEY_CONSTRUCTION_RE.test(line)) {
        violations.push(`${rel}:${lineNo} — inline \${collection}/\${slug} key construction`);
      }
      if (INGREDIENT_META_RE.test(line)) {
        violations.push(`${rel}:${lineNo} — direct "ingredientMeta" string literal`);
      }
      if (PAIRING_META_RE.test(line)) {
        violations.push(`${rel}:${lineNo} — direct "pairingMeta" string literal`);
      }
    });
  }

  test("no file constructs meta keys or names meta collections directly", () => {
    if (violations.length > 0) {
      console.error("Contract violations:\n" + violations.join("\n"));
    }
    expect(violations).toEqual([]);
  });
});
