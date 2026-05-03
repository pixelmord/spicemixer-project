export type AutoApplyKind =
  | "ingredient-link"
  | "pairing-slug"
  | "language-detection"
  | "tag"
  | "image-attribution";

export type Confidence = "high" | "medium" | "low";

export const ALLOWLIST: ReadonlySet<AutoApplyKind> = new Set([
  "ingredient-link",
  "pairing-slug",
  "language-detection",
  "tag",
  "image-attribution",
]);

// Community origin is always blocked (Phase 1 constraint, per ADR 0004).
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
