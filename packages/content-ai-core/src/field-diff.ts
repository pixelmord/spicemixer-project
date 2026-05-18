import type { FieldConfig } from "./contract.ts";

export function diffFieldHashes(
  current: Record<string, string>,
  snapshot: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(current), ...Object.keys(snapshot)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (current[key] !== snapshot[key]) changed.push(key);
  }
  return changed.sort();
}

export type RefreshKind = "silent" | "review-required";

export function classifyRefreshKind(
  staleFields: string[],
  fieldConfig: Record<string, FieldConfig>,
): RefreshKind {
  for (const field of staleFields) {
    const mode = fieldConfig[field]?.translation?.mode ?? "translate";
    if (mode !== "copy") return "review-required";
  }
  return "silent";
}
