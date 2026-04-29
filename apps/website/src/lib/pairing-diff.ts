import { diffWords, type FieldDiff, type ChangeKind } from "./recipe-diff.ts";

export type { FieldDiff, ChangeKind };
export { diffWords };

function kindFor(oldVal: unknown, newVal: unknown): ChangeKind {
  const hasOld = oldVal !== undefined && oldVal !== null && oldVal !== "";
  const hasNew = newVal !== undefined && newVal !== null && newVal !== "";
  if (!hasOld && hasNew) return "added";
  if (hasOld && !hasNew) return "removed";
  if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return "unchanged";
  return "changed";
}

export function diffPairings(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>,
  locale = "en",
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const getDesc = (obj: Record<string, unknown>) => {
    const descs = obj["descriptions"] as Record<string, string> | undefined;
    if (descs?.[locale]) return descs[locale];
    if (descs?.["en"]) return descs["en"];
    return String(obj["description"] ?? "");
  };

  diffs.push({
    field: "description",
    label: `Description (${locale.toUpperCase()})`,
    kind: kindFor(getDesc(existing), getDesc(proposed)),
    oldValue: getDesc(existing),
    newValue: getDesc(proposed),
  });

  return diffs;
}

export function hasPairingChanges(diffs: FieldDiff[]): boolean {
  return diffs.some((d) => d.kind !== "unchanged");
}
