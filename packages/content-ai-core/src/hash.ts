import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export function normalizePayload(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (Array.isArray(value)) return JSON.stringify(value.map(normalizePayload));
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

// First 12 hex chars of SHA-256 over the normalised field value.
export function fingerprintHash(payload: unknown): string {
  return bytesToHex(sha256(normalizePayload(payload))).slice(0, 12);
}
