/**
 * Extract all JSON-LD payloads from `<script type="application/ld+json">` tags.
 * Malformed JSON blocks are silently skipped.
 */
export function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(re)) {
    try {
      results.push(JSON.parse(match[1]) as unknown);
    } catch {
      // malformed JSON-LD — skip
    }
  }

  return results;
}
