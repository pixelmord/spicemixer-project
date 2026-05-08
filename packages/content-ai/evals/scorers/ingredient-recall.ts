import type { RecipeExtract } from "../../src/schemas/recipe-extract.ts";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ") // strip brackets — treats "dark chocolate (70%)" same as "70% dark chocolate"
    .replace(/[^a-z0-9%./]/g, " ") // keep alphanumeric, %, ., /
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(str: string): string[] {
  return normalize(str).split(" ").filter(Boolean);
}

function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  if (tokA.size === 0 && tokB.size === 0) return 1;
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let shared = 0;
  for (const t of tokA) {
    if (tokB.has(t)) shared++;
  }
  // overlap coefficient: shared / min(|A|, |B|)
  return shared / Math.min(tokA.size, tokB.size);
}

function bestMatch(expected: string, actuals: string[]): number {
  let best = 0;
  for (const actual of actuals) {
    const score = tokenOverlap(expected, actual);
    if (score > best) best = score;
  }
  return best;
}

export function ingredientRecall(
  actual: RecipeExtract,
  expected: RecipeExtract,
): { score: number; missing: string[] } {
  if (!expected.recipeIngredient || expected.recipeIngredient.length === 0) {
    return { score: 1, missing: [] };
  }

  const missing: string[] = [];
  let matched = 0;

  for (const exp of expected.recipeIngredient) {
    const overlap = bestMatch(exp, actual.recipeIngredient ?? []);
    if (overlap >= 0.7) {
      matched++;
    } else {
      missing.push(exp);
    }
  }

  return {
    score: matched / expected.recipeIngredient.length,
    missing,
  };
}
