export type ChangeKind = "added" | "removed" | "changed" | "unchanged";

export interface FieldDiff {
  field: string;
  label: string;
  kind: ChangeKind;
  oldValue: unknown;
  newValue: unknown;
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

export function diffWords(before: string, after: string): WordToken[] {
  const tokenize = (text: string) => text.split(/(\s+)/).filter(Boolean);
  const a = tokenize(before);
  const b = tokenize(after);
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array.from<number>({ length: n + 1 }).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
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

function changeKind(oldVal: unknown, newVal: unknown): ChangeKind {
  const hasOld = oldVal !== undefined && oldVal !== null && oldVal !== "";
  const hasNew = newVal !== undefined && newVal !== null && newVal !== "";
  if (!hasOld && hasNew) return "added";
  if (hasOld && !hasNew) return "removed";
  if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return "unchanged";
  return "changed";
}

function diffStringItems(before: string[], after: string[]): ItemDiff[] {
  const beforeSet = new Set(before.map((s) => s.trim()));
  const afterSet = new Set(after.map((s) => s.trim()));
  const result: ItemDiff[] = [];
  for (const item of after) {
    result.push({ value: item, kind: beforeSet.has(item.trim()) ? "unchanged" : "added" });
  }
  for (const item of before) {
    if (!afterSet.has(item.trim())) result.push({ value: item, kind: "removed" });
  }
  return result;
}

// ── Ingredient diff ───────────────────────────────────────────────────────────

const INGREDIENT_SCALAR_FIELDS: Array<{ field: string; label: string }> = [
  { field: "name", label: "Name" },
  { field: "summary", label: "Summary" },
  { field: "description", label: "Description" },
  { field: "category", label: "Category" },
];

export function diffIngredients(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const { field, label } of INGREDIENT_SCALAR_FIELDS) {
    diffs.push({
      field,
      label,
      kind: changeKind(existing[field], proposed[field]),
      oldValue: existing[field],
      newValue: proposed[field],
    });
  }
  const oldOrigin = Array.isArray(existing["origin"]) ? (existing["origin"] as string[]) : [];
  const newOrigin = Array.isArray(proposed["origin"]) ? (proposed["origin"] as string[]) : [];
  diffs.push({
    field: "origin",
    label: "Origin",
    kind: changeKind(
      oldOrigin.length ? oldOrigin : undefined,
      newOrigin.length ? newOrigin : undefined,
    ),
    oldValue: oldOrigin,
    newValue: newOrigin,
    itemDiffs: diffStringItems(oldOrigin, newOrigin),
  });
  const oldNotes = Array.isArray(existing["flavorNotes"])
    ? (existing["flavorNotes"] as string[])
    : [];
  const newNotes = Array.isArray(proposed["flavorNotes"])
    ? (proposed["flavorNotes"] as string[])
    : [];
  diffs.push({
    field: "flavorNotes",
    label: "Flavor notes",
    kind: changeKind(
      oldNotes.length ? oldNotes : undefined,
      newNotes.length ? newNotes : undefined,
    ),
    oldValue: oldNotes,
    newValue: newNotes,
    itemDiffs: diffStringItems(oldNotes, newNotes),
  });
  return diffs;
}

// ── Recipe diff ───────────────────────────────────────────────────────────────

const RECIPE_SCALAR_FIELDS: Array<{ field: string; label: string }> = [
  { field: "name", label: "Name" },
  { field: "description", label: "Description" },
  { field: "recipeYield", label: "Yield" },
  { field: "prepTime", label: "Prep time" },
  { field: "cookTime", label: "Cook time" },
  { field: "totalTime", label: "Total time" },
  { field: "recipeCategory", label: "Category" },
  { field: "recipeCuisine", label: "Cuisine" },
];

function stepText(step: unknown): string {
  if (typeof step === "string") return step;
  if (typeof step === "object" && step !== null && "text" in step)
    return String((step as { text: string }).text);
  return "";
}

function diffInstructionItems(before: unknown[], after: unknown[]): ItemDiff[] {
  const beforeTexts = new Set(before.map((s) => stepText(s).trim()));
  const afterTexts = new Set(after.map((s) => stepText(s).trim()));
  const result: ItemDiff[] = [];
  for (const item of after) {
    const t = stepText(item).trim();
    result.push({ value: stepText(item), kind: beforeTexts.has(t) ? "unchanged" : "added" });
  }
  for (const item of before) {
    const t = stepText(item).trim();
    if (!afterTexts.has(t)) result.push({ value: stepText(item), kind: "removed" });
  }
  return result;
}

export function diffRecipes(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const { field, label } of RECIPE_SCALAR_FIELDS) {
    diffs.push({
      field,
      label,
      kind: changeKind(existing[field], proposed[field]),
      oldValue: existing[field],
      newValue: proposed[field],
    });
  }
  const oldIng = Array.isArray(existing["recipeIngredient"])
    ? (existing["recipeIngredient"] as string[])
    : [];
  const newIng = Array.isArray(proposed["recipeIngredient"])
    ? (proposed["recipeIngredient"] as string[])
    : [];
  diffs.push({
    field: "recipeIngredient",
    label: "Ingredients",
    kind: changeKind(oldIng.length ? oldIng : undefined, newIng.length ? newIng : undefined),
    oldValue: oldIng,
    newValue: newIng,
    itemDiffs: diffStringItems(oldIng, newIng),
  });
  const oldKw = Array.isArray(existing["keywords"]) ? (existing["keywords"] as string[]) : [];
  const newKw = Array.isArray(proposed["keywords"]) ? (proposed["keywords"] as string[]) : [];
  diffs.push({
    field: "keywords",
    label: "Keywords",
    kind: changeKind(oldKw.length ? oldKw : undefined, newKw.length ? newKw : undefined),
    oldValue: oldKw,
    newValue: newKw,
    itemDiffs: diffStringItems(oldKw, newKw),
  });
  const oldInstr = Array.isArray(existing["recipeInstructions"])
    ? existing["recipeInstructions"]
    : [];
  const newInstr = Array.isArray(proposed["recipeInstructions"])
    ? proposed["recipeInstructions"]
    : [];
  diffs.push({
    field: "recipeInstructions",
    label: "Instructions",
    kind: changeKind(
      oldInstr.length ? oldInstr : undefined,
      newInstr.length ? newInstr : undefined,
    ),
    oldValue: oldInstr,
    newValue: newInstr,
    itemDiffs: diffInstructionItems(oldInstr, newInstr),
  });
  return diffs;
}

// ── Pairing diff ──────────────────────────────────────────────────────────────

export function diffPairings(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>,
  locale = "en",
): FieldDiff[] {
  const getDesc = (obj: Record<string, unknown>) => {
    const descs = obj["descriptions"] as Record<string, string> | undefined;
    if (descs?.[locale]) return descs[locale];
    if (descs?.["en"]) return descs["en"];
    return (obj["description"] as string | undefined) ?? "";
  };
  return [
    {
      field: "description",
      label: `Description (${locale.toUpperCase()})`,
      kind: changeKind(getDesc(existing), getDesc(proposed)),
      oldValue: getDesc(existing),
      newValue: getDesc(proposed),
    },
  ];
}
