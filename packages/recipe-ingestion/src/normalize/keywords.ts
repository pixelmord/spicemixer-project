export function normalizeKeywords(raw: unknown): string[] | undefined {
  if (!raw) return undefined;

  const items: string[] = Array.isArray(raw)
    ? raw.map((k) => (typeof k === "string" ? k : String(k)))
    : typeof raw === "string"
      ? raw.split(",")
      : [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const k of items) {
    const trimmed = k.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }

  return result.length > 0 ? result : undefined;
}
