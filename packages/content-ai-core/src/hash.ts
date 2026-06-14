import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

/**
 * Canonicalize a value to a stable string before hashing: strings are trimmed
 * and lowercased, object keys sorted, arrays recursed. Ensures cosmetically
 * different inputs (key order, casing, whitespace) hash identically — the basis
 * for fingerprint-based dedup and suppression.
 */
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

/**
 * Short fingerprint of a value: the first 12 hex chars of SHA-256 over its
 * {@link normalizePayload | normalized} form. Used to identify a suggestion for
 * dedup and suppression — collisions are acceptable at this length for that use.
 */
export function fingerprintHash(payload: unknown): string {
  return bytesToHex(sha256(normalizePayload(payload))).slice(0, 12);
}

/** Alias of {@link fingerprintHash}, named for the suggestion-hashing use site. */
export const hashSuggestion = fingerprintHash;

/**
 * Full-length SHA-256 hex over a normalized record. Used for content
 * fingerprinting (e.g. per-field hashes that drive stale-field diffing), where
 * collision resistance matters more than brevity.
 */
export function hashContent(record: unknown): string {
  return bytesToHex(sha256(normalizePayload(record)));
}
