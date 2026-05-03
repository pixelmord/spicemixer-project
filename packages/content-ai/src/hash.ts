import { createHash } from "node:crypto";

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

export function hashSuggestion(payload: unknown): string {
  return createHash("sha256").update(normalizePayload(payload)).digest("hex").slice(0, 12);
}

export function hashContent(record: unknown): string {
  return createHash("sha256").update(normalizePayload(record)).digest("hex");
}
