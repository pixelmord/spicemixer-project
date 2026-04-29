import { diffWords, type FieldDiff, type ItemDiff, type ChangeKind } from "./recipe-diff.ts";

export type { FieldDiff, ItemDiff, ChangeKind };
export { diffWords };

function kindFor(oldVal: unknown, newVal: unknown): ChangeKind {
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
    if (!afterSet.has(item.trim())) {
      result.push({ value: item, kind: "removed" });
    }
  }
  return result;
}

const SCALAR_FIELDS: Array<{ field: string; label: string }> = [
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

  for (const { field, label } of SCALAR_FIELDS) {
    const oldVal = existing[field];
    const newVal = proposed[field];
    diffs.push({ field, label, kind: kindFor(oldVal, newVal), oldValue: oldVal, newValue: newVal });
  }

  // origin
  const oldOrigin = Array.isArray(existing["origin"]) ? (existing["origin"] as string[]) : [];
  const newOrigin = Array.isArray(proposed["origin"]) ? (proposed["origin"] as string[]) : [];
  diffs.push({
    field: "origin",
    label: "Origin",
    kind: kindFor(
      oldOrigin.length ? oldOrigin : undefined,
      newOrigin.length ? newOrigin : undefined,
    ),
    oldValue: oldOrigin,
    newValue: newOrigin,
    itemDiffs: diffStringItems(oldOrigin, newOrigin),
  });

  // flavorNotes
  const oldNotes = Array.isArray(existing["flavorNotes"])
    ? (existing["flavorNotes"] as string[])
    : [];
  const newNotes = Array.isArray(proposed["flavorNotes"])
    ? (proposed["flavorNotes"] as string[])
    : [];
  diffs.push({
    field: "flavorNotes",
    label: "Flavor notes",
    kind: kindFor(oldNotes.length ? oldNotes : undefined, newNotes.length ? newNotes : undefined),
    oldValue: oldNotes,
    newValue: newNotes,
    itemDiffs: diffStringItems(oldNotes, newNotes),
  });

  return diffs;
}

export function hasIngredientChanges(diffs: FieldDiff[]): boolean {
  return diffs.some((d) => d.kind !== "unchanged");
}
