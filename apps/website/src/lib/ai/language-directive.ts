export type AiLocale = "en" | "de";

function languageName(loc: AiLocale): string {
  return loc === "de" ? "German (Deutsch)" : "English";
}

/**
 * Strict directive for extract/generate flows where the caller knows the
 * required output language (e.g. linking an ingredient into a recipe in a
 * specific locale). The model must translate the source if needed.
 */
export function targetLanguageDirective(target: AiLocale): string {
  const name = languageName(target);
  return `LANGUAGE — NON-NEGOTIABLE, OVERRIDES ALL OTHER INSTRUCTIONS:
- The output MUST be entirely in ${name}.
- If the source material is in a different language, TRANSLATE every natural-language field into ${name}.
- This rule overrides any instinct to "preserve the source language". The target language wins.
- Identifiers, slugs, enum values, ISO 8601 durations, country codes, and trademarked product names stay as-is.
- Do NOT mix languages. Every name, description, summary, ingredient string, instruction, flavor note, origin, and keyword must be in ${name}.`;
}

/** Fallback for extract flows where no target locale is known: keep source language. */
export const preserveSourceLanguageDirective = `LANGUAGE — non-negotiable:
- Preserve the source language exactly. If the source is in German, output German; if French, output French; etc. Never translate.
- Do NOT mix languages within a single output. Pick the dominant language of the source and stick to it for every natural-language field.`;

/**
 * Directive for merge flows: keep everything in the existing record's locale.
 * New content in a different language must be translated to match.
 */
export function mergeLanguageDirective(existingLocale: AiLocale | undefined): string {
  if (!existingLocale) {
    return `LANGUAGE — non-negotiable:
- Preserve the language of the existing record. Never translate existing fields.
- If new content is in a different language than the existing record, translate it into the existing record's language so the output is monolingual.`;
  }
  const name = languageName(existingLocale);
  return `LANGUAGE — NON-NEGOTIABLE, OVERRIDES ALL OTHER INSTRUCTIONS:
- The existing record is in ${name}. Every natural-language field in the OUTPUT must be in ${name}.
- If new content is in a different language, TRANSLATE it into ${name} before merging.
- Do NOT mix languages. The merged record stays monolingual in ${name}.
- Identifiers, slugs, enum values, ISO 8601 durations, country codes, and trademarked product names stay as-is.`;
}
