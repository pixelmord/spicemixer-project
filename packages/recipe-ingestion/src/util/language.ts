/**
 * Resolve a BCP-47 language tag from the recipe ingestion sources, in priority order:
 *   1. JSON-LD `inLanguage` (schema.org standard)
 *   2. The HTML `<html lang="...">` attribute
 *
 * Returns the lower-cased two-letter primary subtag (e.g. "en", "de"), or
 * undefined if neither source yields a usable value.
 */
export function resolveLanguage(inLanguage: unknown, html: string | undefined): string | undefined {
  return normalize(inLanguage) ?? extractHtmlLang(html);
}

export function extractHtmlLang(html: string | undefined): string | undefined {
  if (!html) return undefined;
  // Match <html ... lang="xx-YY" ...> or <html ... xml:lang="xx-YY" ...>.
  // Anchored to <html so a `lang` on some other element doesn't sneak in.
  const m =
    /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html) ??
    /<html\b[^>]*\bxml:lang\s*=\s*["']([^"']+)["']/i.exec(html);
  return normalize(m?.[1]);
}

function normalize(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length < 2) return undefined;
  return trimmed.slice(0, 2).toLowerCase();
}
