import { createHash } from "node:crypto";

/**
 * Normalizes an arbitrary value for stable hashing:
 * - Objects: keys sorted recursively
 * - Strings: trimmed and lowercased
 * - Arrays/primitives: recursively normalized
 */
export function normalizePayload(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(normalizePayload));
  }
  if (value !== null && typeof value === "object") {
    const sorted = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizePayload(v)]),
    );
    return JSON.stringify(sorted);
  }
  return JSON.stringify(value);
}

/** SHA-256 first 12 hex chars over normalized payload — used for suggestion dedup. */
export function hashSuggestion(payload: unknown): string {
  return createHash("sha256").update(normalizePayload(payload)).digest("hex").slice(0, 12);
}

/** Full SHA-256 hex over normalized payload — used for canonical content hashes. */
export function hashContent(record: unknown): string {
  return createHash("sha256").update(normalizePayload(record)).digest("hex");
}
