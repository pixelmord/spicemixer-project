import type { RecipeExtract } from "../../src/schemas/recipe-extract.ts";

function normalizeStep(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from<number>({ length: n + 1 }).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function instructionOrderPreserved(actual: RecipeExtract, expected: RecipeExtract): boolean {
  const expSteps = (expected.recipeInstructions ?? []).map((s) => normalizeStep(s.text));
  const actSteps = (actual.recipeInstructions ?? []).map((s) => normalizeStep(s.text));

  if (expSteps.length === 0) return true;

  const lcs = lcsLength(expSteps, actSteps);
  return lcs / expSteps.length >= 0.8;
}
