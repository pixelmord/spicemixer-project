import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

// Structural contract tests for PRD 12.7 — AdminUI form changes:
// - Drop goesWellWith / usesBase comboboxes from RecipeForm
// - Drop PairingEditor from IngredientForm
// - Add CreatePairingDialog wiring to both forms
// - Add read-only "Pairings featuring this entity" section to both forms
// - Add Variants section to RecipeForm (recipe/mixture)

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

describe("RecipeForm — goesWellWith / usesBase removal", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "recipe", "RecipeForm.tsx"), "utf-8");
  });

  test("no longer has goesWellWith state", () => {
    expect(src).not.toMatch(/\bgoesWellWith\b/);
  });

  test("no longer has usesBase state", () => {
    expect(src).not.toMatch(/\busesBase\b/);
  });

  test("no longer renders 'Goes well with' label", () => {
    expect(src).not.toMatch(/Goes well with/);
  });

  test("no longer renders 'Uses base' label", () => {
    expect(src).not.toMatch(/Uses base/);
  });
});

describe("RecipeForm — Variants section", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "recipe", "RecipeForm.tsx"), "utf-8");
  });

  test("has variants state", () => {
    expect(src).toMatch(/\bvariants\b.*useState|useState.*\bvariants\b/s);
  });

  test("renders a Variants section", () => {
    expect(src).toMatch(/[Vv]ariants/);
  });

  test("passes variants to meta payload on save", () => {
    expect(src).toMatch(/variants[,\s]/);
  });
});

describe("RecipeForm — CreatePairingDialog wiring (delegated to PairingsSection)", () => {
  let src: string;
  let pairingsSrc: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "recipe", "RecipeForm.tsx"), "utf-8");
    pairingsSrc = await readFile(
      join(COMPONENTS, "forms", "_shared", "PairingsSection.tsx"),
      "utf-8",
    );
  });

  test("RecipeForm imports PairingsSection", () => {
    expect(src).toMatch(/PairingsSection/);
  });

  test("PairingsSection owns CreatePairingDialog", () => {
    expect(pairingsSrc).toMatch(/CreatePairingDialog/);
  });

  test("RecipeForm wires pairingProposals to PairingsSection", () => {
    expect(src).toMatch(/pairingProposals/);
  });
});

describe("RecipeForm — read-only featured pairings section", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "recipe", "RecipeForm.tsx"), "utf-8");
  });

  test("calls listPairingsFor to load pairings", () => {
    expect(src).toMatch(/listPairingsFor/);
  });

  test("has state for featured pairings", () => {
    expect(src).toMatch(/featuredPairings/);
  });
});

describe("IngredientForm — PairingEditor removal", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "ingredient", "IngredientForm.tsx"), "utf-8");
  });

  test("no longer imports PairingEditor", () => {
    expect(src).not.toMatch(/PairingEditor/);
  });

  test("no longer renders PairingEditor", () => {
    expect(src).not.toMatch(/<PairingEditor/);
  });

  test("no longer has initialPairings prop", () => {
    expect(src).not.toMatch(/initialPairings/);
  });

  test("no longer has pairings state from PairingEditor shape", () => {
    expect(src).not.toMatch(/Pairing\[\]/);
  });
});

// CreatePairingDialog and pendingPairingDialog state moved into
// forms/_shared/PairingsSection.tsx. The orchestrator now only mounts
// <PairingsSection> and passes the create handler down.

describe("IngredientForm — PairingsSection integration", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "ingredient", "IngredientForm.tsx"), "utf-8");
  });

  test("mounts the shared PairingsSection", () => {
    expect(src).toMatch(/<PairingsSection/);
  });

  test("passes the create-pairing handler to PairingsSection", () => {
    expect(src).toMatch(/onCreatePairing=\{handleCreatePairing\}/);
  });
});

describe("IngredientForm — read-only featured pairings section", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "ingredient", "IngredientForm.tsx"), "utf-8");
  });

  test("calls listPairingsFor to load pairings", () => {
    expect(src).toMatch(/listPairingsFor/);
  });

  test("has state for featured pairings", () => {
    expect(src).toMatch(/featuredPairings/);
  });
});
