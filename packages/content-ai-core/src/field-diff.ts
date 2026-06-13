import type { FieldConfig } from "./contract.ts";

/**
 * Field names whose content hash differs between `current` and a prior
 * `snapshot` (sorted). Drives detection of which fields went stale since the
 * last AI fill, e.g. for deciding what a translation refresh must re-run.
 */
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

/**
 * Whether a refresh can be applied without review. `silent` when every stale
 * field is locale-invariant (`copy`); `review-required` otherwise.
 */
export type RefreshKind = "silent" | "review-required";

/**
 * Classify a set of `staleFields` against their contract configs: returns
 * `silent` only if all stale fields use `{ mode: "copy" }` translation,
 * else `review-required`. Used to decide whether a sibling-locale refresh can
 * auto-apply or must surface for human review.
 */
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
