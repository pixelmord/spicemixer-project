import { REGIONS } from "../regions.ts";

// ADR 0007 Phase 2 entry criteria thresholds
const REGION_MIN = 3;
const KIND_MIN = 3;
const CATEGORY_MIN = 5;
const DENSITY_PASS_RATIO = 3;
const DENSITY_WARN_RATIO = 2;
const COMPLETENESS_PASS_PCT = 80;
const COMPLETENESS_WARN_PCT = 60;

export const MIXTURE_KINDS = [
  "spicemix",
  "sauce",
  "rub",
  "oil",
  "pickle",
  "chutney",
  "marinade",
] as const;

export const INGREDIENT_CATEGORIES = [
  "spice",
  "herb",
  "seed",
  "salt",
  "acid",
  "allium",
  "dried-fruit",
] as const;

export type GateStatus = "pass" | "warn" | "fail";

export interface GateResult {
  key: string;
  label: string;
  status: GateStatus;
  current: number;
  target: number;
  failingItems?: string[];
}

export interface CorpusMixture {
  slug: string;
  kind?: string;
  regions: string[];
}

export interface CorpusIngredient {
  slug: string;
  category: string;
  flavorProfile: string[];
  regions: string[];
  culinaryUse?: string;
  hasImage: boolean;
}

export interface CorpusPairing {
  slugs: [string, string];
}

export interface CorpusRecipe {
  mixtureRefs: string[];
}

export interface Corpus {
  mixtures: CorpusMixture[];
  ingredients: CorpusIngredient[];
  pairings: CorpusPairing[];
  recipes: CorpusRecipe[];
}

function gateRegionCoverage(corpus: Corpus): GateResult {
  const counts = new Map<string, number>(REGIONS.map((r) => [r, 0]));
  for (const m of corpus.mixtures) {
    for (const r of m.regions) {
      if (counts.has(r)) counts.set(r, counts.get(r)! + 1);
    }
  }
  for (const i of corpus.ingredients) {
    for (const r of i.regions) {
      if (counts.has(r)) counts.set(r, counts.get(r)! + 1);
    }
  }

  const failing: string[] = [];
  let passCount = 0;
  let hasZero = false;
  for (const region of REGIONS) {
    const count = counts.get(region)!;
    if (count >= REGION_MIN) {
      passCount++;
    } else {
      failing.push(`${region} (${count}/${REGION_MIN})`);
      if (count === 0) hasZero = true;
    }
  }

  return {
    key: "region-coverage",
    label: "Region coverage",
    status: passCount === REGIONS.length ? "pass" : hasZero ? "fail" : "warn",
    current: passCount,
    target: REGIONS.length,
    failingItems: failing.length > 0 ? failing : undefined,
  };
}

function gateMixtureKindCoverage(corpus: Corpus): GateResult {
  const counts = new Map<string, number>(MIXTURE_KINDS.map((k) => [k, 0]));
  for (const m of corpus.mixtures) {
    if (m.kind && counts.has(m.kind)) {
      counts.set(m.kind, counts.get(m.kind)! + 1);
    }
  }

  const failing: string[] = [];
  let passCount = 0;
  let hasZero = false;
  for (const kind of MIXTURE_KINDS) {
    const count = counts.get(kind)!;
    if (count >= KIND_MIN) {
      passCount++;
    } else {
      failing.push(`${kind} (${count}/${KIND_MIN})`);
      if (count === 0) hasZero = true;
    }
  }

  return {
    key: "mixture-kind-coverage",
    label: "Mixture kind coverage",
    status: passCount === MIXTURE_KINDS.length ? "pass" : hasZero ? "fail" : "warn",
    current: passCount,
    target: MIXTURE_KINDS.length,
    failingItems: failing.length > 0 ? failing : undefined,
  };
}

function gateIngredientCategoryCoverage(corpus: Corpus): GateResult {
  const counts = new Map<string, number>(INGREDIENT_CATEGORIES.map((c) => [c, 0]));
  for (const i of corpus.ingredients) {
    if (counts.has(i.category)) {
      counts.set(i.category, counts.get(i.category)! + 1);
    }
  }

  const failing: string[] = [];
  let passCount = 0;
  let hasZero = false;
  for (const category of INGREDIENT_CATEGORIES) {
    const count = counts.get(category)!;
    if (count >= CATEGORY_MIN) {
      passCount++;
    } else {
      failing.push(`${category} (${count}/${CATEGORY_MIN})`);
      if (count === 0) hasZero = true;
    }
  }

  return {
    key: "ingredient-category-coverage",
    label: "Ingredient category coverage",
    status: passCount === INGREDIENT_CATEGORIES.length ? "pass" : hasZero ? "fail" : "warn",
    current: passCount,
    target: INGREDIENT_CATEGORIES.length,
    failingItems: failing.length > 0 ? failing : undefined,
  };
}

function gateGraphConnectivity(corpus: Corpus): GateResult {
  const mixtureCount = corpus.mixtures.length;
  if (mixtureCount === 0) {
    return {
      key: "graph-connectivity",
      label: "Graph connectivity",
      status: "pass",
      current: 0,
      target: 0,
    };
  }

  const mixtureSlugs = new Set(corpus.mixtures.map((m) => m.slug));
  const connected = new Set<string>();

  for (const p of corpus.pairings) {
    for (const slug of p.slugs) {
      if (mixtureSlugs.has(slug)) connected.add(slug);
    }
  }
  for (const r of corpus.recipes) {
    for (const ref of r.mixtureRefs) {
      if (mixtureSlugs.has(ref)) connected.add(ref);
    }
  }

  const connectedCount = connected.size;
  const failing = corpus.mixtures.filter((m) => !connected.has(m.slug)).map((m) => m.slug);

  return {
    key: "graph-connectivity",
    label: "Graph connectivity",
    status: connectedCount === mixtureCount ? "pass" : "fail",
    current: connectedCount,
    target: mixtureCount,
    failingItems: failing.length > 0 ? failing : undefined,
  };
}

function gatePairingDensity(corpus: Corpus): GateResult {
  const pairingCount = corpus.pairings.length;
  const mixtureCount = corpus.mixtures.length;
  const target = mixtureCount * DENSITY_PASS_RATIO;
  const warnThreshold = mixtureCount * DENSITY_WARN_RATIO;

  const status: GateStatus =
    pairingCount >= target ? "pass" : pairingCount >= warnThreshold ? "warn" : "fail";

  return {
    key: "pairing-density",
    label: "Pairing density",
    status,
    current: pairingCount,
    target,
  };
}

function gateIngredientCompleteness(corpus: Corpus): GateResult {
  const total = corpus.ingredients.length;
  if (total === 0) {
    return {
      key: "ingredient-completeness",
      label: "Ingredient completeness",
      status: "pass",
      current: 0,
      target: 0,
    };
  }

  const failing: string[] = [];
  let completeCount = 0;
  for (const i of corpus.ingredients) {
    const complete =
      i.flavorProfile.length > 0 && i.regions.length > 0 && !!i.culinaryUse?.trim() && i.hasImage;
    if (complete) {
      completeCount++;
    } else {
      failing.push(i.slug);
    }
  }

  const pct = Math.round((completeCount / total) * 100);
  const status: GateStatus =
    pct >= COMPLETENESS_PASS_PCT ? "pass" : pct >= COMPLETENESS_WARN_PCT ? "warn" : "fail";

  return {
    key: "ingredient-completeness",
    label: "Ingredient completeness",
    status,
    current: completeCount,
    target: total,
    failingItems: failing.length > 0 ? failing : undefined,
  };
}

export function computeContentGates(corpus: Corpus): GateResult[] {
  return [
    gateRegionCoverage(corpus),
    gateMixtureKindCoverage(corpus),
    gateIngredientCategoryCoverage(corpus),
    gateGraphConnectivity(corpus),
    gatePairingDensity(corpus),
    gateIngredientCompleteness(corpus),
  ];
}
