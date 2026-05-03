export type AutoApplyKind =
  | "ingredient-link"
  | "pairing-slug"
  | "language-detection"
  | "tag"
  | "image-attribution";

export type Confidence = "high" | "medium" | "low";

/** Exhaustive set of suggestion kinds that may be auto-applied. */
export const ALLOWLIST: ReadonlySet<AutoApplyKind> = new Set([
  "ingredient-link",
  "pairing-slug",
  "language-detection",
  "tag",
  "image-attribution",
]);

/**
 * Returns true only when ALL three gates pass:
 * 1. origin is "editor" (community-submitted content is never auto-applied in Phase 1)
 * 2. kind is in the ALLOWLIST
 * 3. confidence is "high" or numeric >= 0.85
 */
export function isAllowedAutoApply(
  kind: AutoApplyKind,
  confidence: Confidence | number,
  origin: "editor" | "community",
): boolean {
  if (origin === "community") return false;
  if (!ALLOWLIST.has(kind)) return false;
  if (typeof confidence === "number") return confidence >= 0.85;
  return confidence === "high";
}

export function assertAutoApplyAllowed(
  kind: AutoApplyKind,
  confidence: Confidence | number,
  origin: "editor" | "community",
): void {
  if (!isAllowedAutoApply(kind, confidence, origin)) {
    throw new Error(
      `Auto-apply not allowed: kind="${kind}" confidence="${String(confidence)}" origin="${origin}"`,
    );
  }
}
