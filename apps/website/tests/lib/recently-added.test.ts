import { describe, expect, test } from "vite-plus/test";
import { recentlyAdded } from "../../src/lib/recently-added.ts";
import type { RecentEntry } from "../../src/lib/recently-added.ts";

const mixture: RecentEntry = {
  type: "mixture",
  slug: "harissa",
  name: "Harissa",
  href: "/mixtures/harissa/",
  datePublished: "2026-04-18",
};
const ingredient: RecentEntry = {
  type: "ingredient",
  slug: "cardamom",
  name: "Cardamom",
  href: "/ingredients/cardamom/",
  datePublished: "2026-03-10",
};
const pairing: RecentEntry = {
  type: "pairing",
  slug: "cardamom--cumin",
  name: "Cardamom & Cumin",
  href: "/pairings/cardamom--cumin/",
};
const recipe: RecentEntry = {
  type: "recipe",
  slug: "miso-ramen",
  name: "Miso Ramen",
  href: "/recipes/miso-ramen/",
  datePublished: "2026-04-01",
};

const cases: Array<{
  label: string;
  input: RecentEntry[];
  options?: Parameters<typeof recentlyAdded>[1];
  expected: RecentEntry[];
}> = [
  {
    label: "empty corpus returns empty array",
    input: [],
    expected: [],
  },
  {
    label: "sorts dated entries newest-first",
    input: [ingredient, mixture],
    expected: [mixture, ingredient],
  },
  {
    label: "undated entries sort after dated ones",
    input: [pairing, mixture],
    expected: [mixture, pairing],
  },
  {
    label: "multiple undated entries preserve insertion order",
    input: [pairing, { ...pairing, slug: "cumin--sumac", name: "Cumin & Sumac" }],
    expected: [pairing, { ...pairing, slug: "cumin--sumac", name: "Cumin & Sumac" }],
  },
  {
    label: "excludeRecipes: true removes recipe entries",
    input: [mixture, recipe, ingredient, pairing],
    options: { excludeRecipes: true },
    expected: [mixture, ingredient, pairing],
  },
  {
    label: "excludeRecipes: false (default) keeps recipe entries",
    input: [mixture, recipe],
    options: { excludeRecipes: false },
    expected: [mixture, recipe],
  },
  {
    label: "limit caps the result length",
    input: [mixture, ingredient, pairing],
    options: { limit: 2 },
    expected: [mixture, ingredient],
  },
  {
    label: "excludeRecipes + limit combined",
    input: [mixture, recipe, ingredient, pairing],
    options: { excludeRecipes: true, limit: 2 },
    expected: [mixture, ingredient],
  },
];

describe("recentlyAdded", () => {
  for (const { label, input, options, expected } of cases) {
    test(label, () => {
      expect(recentlyAdded(input, options)).toEqual(expected);
    });
  }
});
