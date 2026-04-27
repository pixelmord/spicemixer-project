const ISO_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

export function formatIsoDuration(value: string | undefined): string | null {
  if (!value) return null;
  const match = ISO_DURATION.exec(value);
  if (!match) return null;
  const [, h, m, s] = match;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.length ? parts.join(" ") : null;
}
