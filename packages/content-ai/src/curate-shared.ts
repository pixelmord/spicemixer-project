export function normalizeConfidence(v: string): "high" | "medium" | "low" {
  const lower = v.toLowerCase().trim();
  if (lower === "high" || lower.includes("high")) return "high";
  if (lower === "medium" || lower.includes("medium") || lower === "moderate") return "medium";
  return "low";
}
