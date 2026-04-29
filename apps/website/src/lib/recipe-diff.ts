export type ChangeKind = "added" | "removed" | "changed" | "unchanged";

export interface FieldDiff {
  field: string;
  label: string;
  kind: ChangeKind;
  oldValue: unknown;
  newValue: unknown;
  // Fine-grained item-level diffs for array fields
  itemDiffs?: ItemDiff[];
}

export interface ItemDiff {
  value: string;
  kind: ChangeKind;
}

export interface WordToken {
  text: string;
  kind: "added" | "removed" | "unchanged";
}

// ── Word-level diff for text fields ─────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

/** LCS-based word diff. Returns tokens annotated as added/removed/unchanged. */
export function diffWords(before: string, after: string): WordToken[] {
  const a = tokenize(before);
  const b = tokenize(after);

  // Build LCS table
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Traceback
  const tokens: WordToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      tokens.unshift({ text: a[i - 1], kind: "unchanged" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokens.unshift({ text: b[j - 1], kind: "added" });
      j--;
    } else {
      tokens.unshift({ text: a[i - 1], kind: "removed" });
      i--;
    }
  }
  return tokens;
}

// ── Array item diff ──────────────────────────────────────────────────────────

/** Match array items: exact set diff (unchanged if text present in both, else added/removed). */
export function diffStringItems(before: string[], after: string[]): ItemDiff[] {
  const beforeSet = new Set(before.map((s) => s.trim()));
  const afterSet = new Set(after.map((s) => s.trim()));

  const result: ItemDiff[] = [];

  // Items in after
  for (const item of after) {
    result.push({ value: item, kind: beforeSet.has(item.trim()) ? "unchanged" : "added" });
  }
  // Items only in before (removed)
  for (const item of before) {
    if (!afterSet.has(item.trim())) {
      result.push({ value: item, kind: "removed" });
    }
  }
  return result;
}

function stepText(step: unknown): string {
  if (typeof step === "string") return step;
  if (typeof step === "object" && step !== null && "text" in step)
    return String((step as { text: string }).text);
  return "";
}

export function diffInstructionItems(before: unknown[], after: unknown[]): ItemDiff[] {
  const beforeTexts = new Set(before.map((s) => stepText(s).trim()));
  const afterTexts = new Set(after.map((s) => stepText(s).trim()));
  const result: ItemDiff[] = [];
  for (const item of after) {
    const t = stepText(item).trim();
    result.push({ value: stepText(item), kind: beforeTexts.has(t) ? "unchanged" : "added" });
  }
  for (const item of before) {
    const t = stepText(item).trim();
    if (!afterTexts.has(t)) {
      result.push({ value: stepText(item), kind: "removed" });
    }
  }
  return result;
}

// ── Field-level diff ─────────────────────────────────────────────────────────

const SCALAR_FIELDS: Array<{ field: string; label: string }> = [
  { field: "name", label: "Name" },
  { field: "description", label: "Description" },
  { field: "recipeYield", label: "Yield" },
  { field: "prepTime", label: "Prep time" },
  { field: "cookTime", label: "Cook time" },
  { field: "totalTime", label: "Total time" },
  { field: "recipeCategory", label: "Category" },
  { field: "recipeCuisine", label: "Cuisine" },
];

function kindFor(oldVal: unknown, newVal: unknown): ChangeKind {
  const hasOld = oldVal !== undefined && oldVal !== null && oldVal !== "";
  const hasNew = newVal !== undefined && newVal !== null && newVal !== "";
  if (!hasOld && hasNew) return "added";
  if (hasOld && !hasNew) return "removed";
  if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return "unchanged";
  return "changed";
}

export function diffRecipes(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  for (const { field, label } of SCALAR_FIELDS) {
    const oldVal = existing[field];
    const newVal = proposed[field];
    diffs.push({ field, label, kind: kindFor(oldVal, newVal), oldValue: oldVal, newValue: newVal });
  }

  // Ingredients
  const oldIng = Array.isArray(existing["recipeIngredient"])
    ? (existing["recipeIngredient"] as string[])
    : [];
  const newIng = Array.isArray(proposed["recipeIngredient"])
    ? (proposed["recipeIngredient"] as string[])
    : [];
  diffs.push({
    field: "recipeIngredient",
    label: "Ingredients",
    kind: kindFor(oldIng.length ? oldIng : undefined, newIng.length ? newIng : undefined),
    oldValue: oldIng,
    newValue: newIng,
    itemDiffs: diffStringItems(oldIng, newIng),
  });

  // Keywords
  const oldKw = Array.isArray(existing["keywords"]) ? (existing["keywords"] as string[]) : [];
  const newKw = Array.isArray(proposed["keywords"]) ? (proposed["keywords"] as string[]) : [];
  diffs.push({
    field: "keywords",
    label: "Keywords",
    kind: kindFor(oldKw.length ? oldKw : undefined, newKw.length ? newKw : undefined),
    oldValue: oldKw,
    newValue: newKw,
    itemDiffs: diffStringItems(oldKw, newKw),
  });

  // Instructions
  const oldInstr = Array.isArray(existing["recipeInstructions"])
    ? existing["recipeInstructions"]
    : [];
  const newInstr = Array.isArray(proposed["recipeInstructions"])
    ? proposed["recipeInstructions"]
    : [];
  diffs.push({
    field: "recipeInstructions",
    label: "Instructions",
    kind: kindFor(oldInstr.length ? oldInstr : undefined, newInstr.length ? newInstr : undefined),
    oldValue: oldInstr,
    newValue: newInstr,
    itemDiffs: diffInstructionItems(oldInstr, newInstr),
  });

  return diffs;
}

export function hasChanges(diffs: FieldDiff[]): boolean {
  return diffs.some((d) => d.kind !== "unchanged");
}

/** Extract changed field names for preview highlighting. */
export function changedFields(diffs: FieldDiff[]): Set<string> {
  return new Set(diffs.filter((d) => d.kind !== "unchanged").map((d) => d.field));
}
