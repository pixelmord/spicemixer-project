export const defaultLang = "en";

export const ui = {
  en: {
    "page.home.title": "Spicemixer — Recipes",
    "page.home.tagline": "Recipes worth cooking again.",
    "page.home.description":
      "A growing collection of dishes from a home kitchen. Filter by tag, category, or cuisine.",
    "filter.count": "of {total} recipes",
    "filter.clear": "Clear filters",
    "filter.category": "Category",
    "filter.cuisine": "Cuisine",
    "filter.tag": "Tag",
    "filter.empty": "No recipes match these filters yet.",
    "recipe.fallback": "Recipe",
    "recipe.more": "+ {n} more",
    "meta.yield": "Yield",
    "meta.prep": "Prep",
    "meta.cook": "Cook",
    "meta.total": "Total",
    "section.ingredients": "Ingredients",
    "section.instructions": "Instructions",
    "nav.back": "← All recipes",
  },
  de: {
    "page.home.title": "Spicemixer — Rezepte",
    "page.home.tagline": "Rezepte, die sich lohnen.",
    "page.home.description":
      "Eine wachsende Sammlung von Gerichten aus einer Heimküche. Filtern nach Tag, Kategorie oder Küche.",
    "filter.count": "von {total} Rezepten",
    "filter.clear": "Filter zurücksetzen",
    "filter.category": "Kategorie",
    "filter.cuisine": "Küche",
    "filter.tag": "Tag",
    "filter.empty": "Keine Rezepte für diese Filter gefunden.",
    "recipe.fallback": "Rezept",
    "recipe.more": "+ {n} weitere",
    "meta.yield": "Menge",
    "meta.prep": "Vorbereitung",
    "meta.cook": "Zubereitung",
    "meta.total": "Gesamt",
    "section.ingredients": "Zutaten",
    "section.instructions": "Zubereitung",
    "nav.back": "← Alle Rezepte",
  },
} as const;

export type Lang = keyof typeof ui;
export type TranslationKey = keyof (typeof ui)[typeof defaultLang];

export function useTranslations(lang: Lang) {
  return function t(key: TranslationKey): string {
    return (ui[lang] as Record<string, string>)[key] ?? ui[defaultLang][key];
  };
}
