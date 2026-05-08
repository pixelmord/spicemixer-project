import { extractJsonLd } from "./extract.ts";
import { findRecipe } from "./find-recipe.ts";
import { normalizeRecipe } from "./normalize/index.ts";
import { IngestError } from "./errors.ts";
import { resolveLanguage } from "./util/language.ts";
import type { IngestResult } from "./types.ts";

/**
 * Parse pre-fetched HTML and return a normalized IngestResult.
 * Throws IngestError if no JSON-LD, no Recipe entity, or validation fails.
 */
export function parseRecipe(html: string, url: string): IngestResult {
  const jsonLd = extractJsonLd(html);
  if (jsonLd.length === 0) {
    throw new IngestError("NO_JSONLD", `No JSON-LD found at ${url}`);
  }

  const rawRecipe = findRecipe(jsonLd);
  if (!rawRecipe) {
    throw new IngestError("NO_RECIPE", `No Recipe entity found in JSON-LD at ${url}`);
  }

  const { recipe, warnings } = normalizeRecipe(rawRecipe, url, jsonLd);

  const language = resolveLanguage((rawRecipe as Record<string, unknown>)["inLanguage"], html);

  return {
    recipe,
    source: { url, fetchedAt: new Date().toISOString() },
    warnings,
    language,
  };
}
