import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

const REQUIRED_ACTIONS = [
  "aiExtractRecipe",
  "aiExtractIngredient",
  "aiExtractPairing",
  "aiGenerateRecipe",
  "aiMergeRecipe",
  "aiMergeIngredient",
  "aiMergePairing",
  "aiRefreshSuggestions",
  "aiRefreshIngredientSuggestions",
  "aiRefreshPairingSuggestions",
  "aiProposeIngredientLinks",
  "aiProposeTags",
  "aiProposeRecipeImprovements",
  "aiProposeIngredientImprovements",
  "aiProposeIngredientPairings",
  "aiTranslatePairing",
  "aiSuggestSlug",
  "aiCreateTranslation",
  "aiCreateIngredientTranslation",
  "aiFillTranslation",
];

describe("CapabilityLabel component", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "CapabilityLabel.tsx"), "utf-8");
  });

  test("exports CAPABILITY_COPY mapping", () => {
    expect(src).toMatch(/^export const CAPABILITY_COPY/m);
  });

  test("exports CapabilityLabel as default", () => {
    expect(src).toMatch(/export default function CapabilityLabel/);
  });

  for (const action of REQUIRED_ACTIONS) {
    test(`CAPABILITY_COPY covers ${action}`, () => {
      expect(src).toContain(action);
    });
  }

  test("falls back to Working… for unknown actions", () => {
    expect(src).toMatch(/Working…/);
  });
});

describe("AiImportPage uses CapabilityLabel", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "AiImportPage.tsx"), "utf-8");
  });

  test("imports CapabilityLabel", () => {
    expect(src).toMatch(/import.*CapabilityLabel.*from.*CapabilityLabel/);
  });

  test("no longer hard-codes Working…", () => {
    expect(src).not.toMatch(/^\s+Working…/m);
  });

  test("renders CapabilityLabel in loading state", () => {
    expect(src).toMatch(/<CapabilityLabel/);
  });
});

describe("PairingSuggestionPanel uses CapabilityLabel", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "PairingSuggestionPanel.tsx"), "utf-8");
  });

  test("imports CapabilityLabel", () => {
    expect(src).toMatch(/import.*CapabilityLabel.*from.*CapabilityLabel/);
  });

  test("renders CapabilityLabel when an op is loading", () => {
    expect(src).toMatch(/<CapabilityLabel/);
  });
});
