/** ISO 8601 duration subset used by schema.org Recipe times (PT + H/M/S). */
export const ISO_DURATION_RE = /^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/;

/** Coerce a human-readable string (e.g. "30 minutes", "1h30m") to an ISO 8601 duration. */
export function toIsoDuration(raw: string): string {
  if (ISO_DURATION_RE.test(raw.trim())) return raw.trim();
  const s = raw.toLowerCase().trim();
  const hours = /(\d+)\s*(?:h(?:ours?)?|hr?)/.exec(s)?.[1];
  const mins = /(\d+)\s*(?:m(?:in(?:utes?)?)?|min)/.exec(s)?.[1];
  const h = hours ? parseInt(hours, 10) : 0;
  const m = mins ? parseInt(mins, 10) : 0;
  if (h || m) return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
  return raw;
}

/** Parse an ISO 8601 duration string into total minutes (returns 0 if invalid). */
export function parseDurationMinutes(iso: string): number {
  if (!ISO_DURATION_RE.test((iso ?? "").trim())) return 0;
  const h = /(\d+)H/.exec(iso)?.[1];
  const m = /(\d+)M/.exec(iso)?.[1];
  return (h ? parseInt(h, 10) * 60 : 0) + (m ? parseInt(m, 10) : 0);
}

/** Convert a total-minutes number back to an ISO 8601 duration string. */
export function minutesToIsoDuration(min: number): string {
  if (min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
}
