// Maps BCP-47 locale codes to full language names. The model reliably respects
// "German" far more than the bare two-letter code "de", so prompts should embed
// the language name rather than the raw locale.
const LOCALE_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
};

export function localeToLanguageName(locale: string): string {
  return LOCALE_LANGUAGE_NAMES[locale] ?? locale;
}
