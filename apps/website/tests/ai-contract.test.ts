import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

// Contract tests ensuring AI policy is enforced centrally (ADR 0004 / PRD #4).

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_ROOT = join(WEBSITE_ROOT, "src");

async function* walkSrc(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSrc(full);
    } else if (/\.(ts|tsx|astro)$/.test(entry.name)) {
      yield full;
    }
  }
}

/** Return all lines in `content` from `startMarker` up to (but not including)
 *  the next occurrence of `endMarker`. Used to loosely extract a handler body. */
function extractRegion(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  if (start === -1) return "";
  const end = content.indexOf(endMarker, start + startMarker.length);
  return end === -1 ? content.slice(start) : content.slice(start, end);
}

// ── Contract 1: No inline confidence equality checks ─────────────────────────
// All auto-apply gating must go through isAllowedAutoApply in packages/content-ai.

const INLINE_CONFIDENCE_GATE =
  /confidence\s*===\s*["'](high|medium|low)["']|confidence\s*>=\s*0?\.\d+/;

describe("ai-contract: no inline confidence gates in website src", () => {
  test("no file in apps/website/src contains inline confidence equality/numeric checks", async () => {
    const violations: string[] = [];

    for await (const filePath of walkSrc(SRC_ROOT)) {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (INLINE_CONFIDENCE_GATE.test(lines[i])) {
          violations.push(`${relative(WEBSITE_ROOT, filePath)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Inline confidence checks found (use isAllowedAutoApply instead):\n${violations.join("\n")}`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ── Contract 2: AI handlers with store.put/sidecar.write also call recordAiEvent ──
// Every AI-driven write path must log the event.
// Handlers may write directly via store.put( or via sidecar.write( (ADR 0006).

const ACTIONS_FILE = join(SRC_ROOT, "actions", "index.ts");

function hasWrite(region: string): boolean {
  return region.includes("store.put(") || region.includes("sidecar.write(");
}

describe("ai-contract: AI action handlers with writes also call recordAiEvent", () => {
  test("aiRefreshSuggestions handler contains a write and recordAiEvent", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(
      content,
      "aiRefreshSuggestions: defineAction(",
      "\n  aiCreateTranslation:",
    );
    expect(region, "aiRefreshSuggestions region not found").not.toBe("");
    expect(hasWrite(region), "handler must contain store.put( or sidecar.write(").toBe(true);
    expect(region).toContain("recordAiEvent(");
  });

  test("aiRefreshIngredientSuggestions handler contains a write and recordAiEvent", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(
      content,
      "aiRefreshIngredientSuggestions: defineAction(",
      "\n  aiCreateIngredientTranslation:",
    );
    expect(region, "aiRefreshIngredientSuggestions region not found").not.toBe("");
    expect(hasWrite(region), "handler must contain store.put( or sidecar.write(").toBe(true);
    expect(region).toContain("recordAiEvent(");
  });

  test("saveRecipe handler calls recordAiEvent when aiMergeModel provided", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(content, "saveRecipe: defineAction(", "\n  saveIngredient:");
    expect(region, "saveRecipe region not found").not.toBe("");
    expect(region).toContain("aiMergeModel");
    expect(region).toContain("recordAiEvent(");
  });

  test("saveIngredient handler calls recordAiEvent when aiMergeModel provided", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(content, "saveIngredient: defineAction(", "\n  savePairing:");
    expect(region, "saveIngredient region not found").not.toBe("");
    expect(region).toContain("aiMergeModel");
    expect(region).toContain("recordAiEvent(");
  });

  test("savePairing handler calls recordAiEvent when aiMergeModel provided", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(content, "savePairing: defineAction(", "\n  togglePairingDraft:");
    expect(region, "savePairing region not found").not.toBe("");
    expect(region).toContain("aiMergeModel");
    expect(region).toContain("recordAiEvent(");
  });
});
