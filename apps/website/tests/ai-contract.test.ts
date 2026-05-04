import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { hashContent } from "../../../packages/content-ai/src/hash.ts";

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

// ── Contract 3: aiRefreshSuggestions cache-hit must not write meta sidecar ───
// Regression guard for the infinite-loop bug: opening /admin/<type>/<slug>/edit
// triggered aiRefreshSuggestions → unconditional sidecar write → Astro glob-
// loader reload → form remount → repeat forever. Two guards prevent this:
// (a) fingerprint early-return skips AI work entirely on a cache hit, and
// (b) content-hash comparison skips the sidecar write when nothing changed.

describe("ai-contract: aiRefreshSuggestions cache-hit must not write meta sidecar", () => {
  test("handler has fingerprint early-return guarded by !force that returns cached: true", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(
      content,
      "aiRefreshSuggestions: defineAction(",
      "\n  aiCreateTranslation:",
    );
    expect(region, "aiRefreshSuggestions region not found").not.toBe("");
    // The early-return path — if removed, the second call always runs AI again
    expect(region).toContain("cached: true");
    // Fingerprint comparison gates the early-return
    expect(region).toContain("cached?.fingerprint === fingerprint");
    // force:true must bypass the cache so explicit refresh always works
    expect(region).toContain("!force");
  });

  test("sidecar write is guarded by stripTimestamp content-hash comparison", async () => {
    const content = await readFile(ACTIONS_FILE, "utf-8");
    const region = extractRegion(
      content,
      "aiRefreshSuggestions: defineAction(",
      "\n  aiCreateTranslation:",
    );
    expect(region, "aiRefreshSuggestions region not found").not.toBe("");
    // stripTimestamp must exist — its removal means at timestamp differences trigger writes
    expect(region).toContain("stripTimestamp");
    // at field must be zeroed so identical runs with a fresh timestamp are a no-op
    expect(region).toMatch(/at:\s*""/);
    // The write must be inside a conditional block, not unconditional
    const writeIdx = region.indexOf("sidecar.write(");
    expect(writeIdx, "sidecar.write( not found in handler").toBeGreaterThan(-1);
    // The if-guard using stripTimestamp must precede the write
    const beforeWrite = region.slice(0, writeIdx);
    expect(beforeWrite).toContain("stripTimestamp");
  });

  // Runtime: verify the hash invariants the cache relies on.
  test("same recipe inputs produce the same fingerprint (cache is stable)", () => {
    const recipe = { name: "Miso Butter Ramen", recipeIngredient: ["miso", "butter"] };
    const inputs = {
      recipe,
      missingFields: ["description"],
      locale: "en",
      model: "gpt-4o",
      rejectedHashes: [],
    };
    expect(hashContent(inputs)).toBe(hashContent(inputs));
  });

  test("different recipe produces a different fingerprint (cache is invalidated)", () => {
    const base = {
      recipe: { name: "Ramen" },
      missingFields: [],
      locale: "en",
      model: "gpt-4o",
      rejectedHashes: [],
    };
    const changed = { ...base, recipe: { name: "Udon" } };
    expect(hashContent(base)).not.toBe(hashContent(changed));
  });

  test("stripTimestamp semantics: two metas differing only in at are hash-equal after stripping", () => {
    // Mirrors the stripTimestamp helper in the handler: { ...m, aiSuggestions: { ...cache, at: "" } }
    const stripAt = (m: Record<string, unknown>) => {
      const cache = m["aiSuggestions"] as { at?: string } | undefined;
      return cache ? { ...m, aiSuggestions: { ...cache, at: "" } } : m;
    };
    const meta1 = {
      aiSuggestions: { fingerprint: "abc", at: "2026-01-01T00:00:00Z", data: { tags: [] } },
    };
    const meta2 = {
      aiSuggestions: { fingerprint: "abc", at: "2026-06-01T12:00:00Z", data: { tags: [] } },
    };
    // Without stripping they differ (timestamps are different)
    expect(hashContent(meta1)).not.toBe(hashContent(meta2));
    // After stripping the at field, they must be identical
    expect(hashContent(stripAt(meta1))).toBe(hashContent(stripAt(meta2)));
  });
});
