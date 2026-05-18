/**
 * Slugs that are actually built into the public site (i.e. not draft and not
 * filtered out by getPublishedX helpers). DE entries use the locale-fallback
 * pattern: when no DE translation exists, the EN canonical slug is still
 * served under /de/ with a fallback banner. Keep this list in sync with what
 * `pnpm build` emits under `dist/client/{,de/}{mixtures,ingredients,recipes,pairings}/`.
 */
export const REPRESENTATIVE_SLUGS = {
  mixtures: {
    en: ["berbere", "harissa", "mojo-rojo", "mojo-verde", "ras-el-hanout"],
    de: ["berbere", "harissa", "mojo-rojo", "mojo-verde", "ras-el-hanout"],
  },
  ingredients: {
    en: [
      "caraway",
      "cardamom",
      "chili-powder",
      "cumin",
      "fenugreek",
      "koriander",
      "saffron",
      "sumac",
    ],
    de: [
      "caraway",
      "cardamom",
      "chili-powder",
      "cumin",
      "fenugreek",
      "koriander",
      "saffron",
      "sumac",
    ],
  },
  recipes: {
    en: [
      "dark-chocolate-rye-cookies",
      "miso-butter-ramen",
      "preserved-lemon-couscous",
      "tomato-confit",
      "vegetable-beef-skillet",
    ],
    de: [
      "dark-chocolate-rye-cookies",
      "miso-butter-ramen",
      "preserved-lemon-couscous",
      "tomato-confit",
      "vegetable-beef-skillet",
    ],
  },
  pairings: {
    en: [
      "cardamom--saffron",
      "chili-powder--cumin",
      "cumin--fenugreek",
      "cumin--koriander",
      "cumin--saffron",
      "cumin--sumac",
    ],
    de: [
      "cardamom--saffron",
      "chili-powder--cumin",
      "cumin--fenugreek",
      "cumin--koriander",
      "cumin--saffron",
      "cumin--sumac",
    ],
  },
} as const;

export type Collection = keyof typeof REPRESENTATIVE_SLUGS;
export type Locale = "en" | "de";
