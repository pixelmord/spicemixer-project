import { getEntry, getCollection } from "astro:content";

/** Locale-aware ingredient lookup with EN fallback. */
export async function getIngredient(slug: string, locale: string) {
  return (
    (await getEntry("ingredients", `${locale}/${slug}`)) ??
    (await getEntry("ingredients", `en/${slug}`))
  );
}

export type RecipeKind = "recipes" | "spicemixes" | "sauces";

export type MetaRef = { collection: RecipeKind; slug: string };
export type IngredientLink = {
  pattern: string;
  slug: string;
  kind?: "ingredient" | "recipe";
  collection?: string;
};
export type ExternalSource = { url: string; title: string; source?: string };

export interface AiSuggestion {
  field: string;
  suggestion: string;
  rationale: string;
}

export interface AiSuggestions {
  contentHash: string;
  generatedAt: string;
  improvements: AiSuggestion[];
  tags: string[];
  ingredientLinks: Array<{ pattern: string; slug: string; confidence: "high" | "medium" | "low" }>;
  relations: Array<{
    kind: "goesWellWith" | "usesBase";
    collection: RecipeKind;
    slug: string;
    name: string;
  }>;
  detectedLanguage?: string;
}

export type Meta = {
  kind?: "recipe" | "spicemix" | "sauce";
  draft?: boolean;
  language?: string;
  locale?: string;
  translationOf?: string;
  translations?: Record<string, string>;
  variantOf?: string;
  variants: string[];
  goesWellWith: MetaRef[];
  usesBase: MetaRef[];
  ingredientLinks: IngredientLink[];
  externalSources: ExternalSource[];
  tags: string[];
  aiSuggestions?: AiSuggestions;
};

const EMPTY_META: Meta = {
  variants: [],
  goesWellWith: [],
  usesBase: [],
  ingredientLinks: [],
  externalSources: [],
  tags: [],
  translations: {},
};

export async function getMeta(kind: RecipeKind, slug: string): Promise<Meta> {
  const entry = await getEntry("meta", `${kind}/${slug}`);
  if (!entry) return EMPTY_META;
  return entry.data as Meta;
}

export type LinkedIngredient = { text: string; slug?: string };

export function linkIngredients(
  ingredients: string[],
  links: IngredientLink[],
): LinkedIngredient[] {
  if (!links.length) return ingredients.map((text) => ({ text }));
  return ingredients.map((ing) => {
    const match = links.find((l) => ing.toLowerCase().includes(l.pattern.toLowerCase()));
    return match ? { text: ing, slug: match.slug } : { text: ing };
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function annotateTextHtml(
  text: string,
  links: IngredientLink[],
  ingredientBase = "/ingredients",
  recipeBase = "",
): string {
  if (!links.length) return escapeHtml(text);
  const sorted = [...links].sort((a, b) => b.pattern.length - a.pattern.length);

  type Span = { text: string; slug?: string; href?: string };
  let spans: Span[] = [{ text }];

  for (const link of sorted) {
    const { pattern, slug, kind, collection } = link;
    const href =
      kind === "recipe"
        ? `${recipeBase}/${collection ?? "recipes"}/${slug}/`
        : `${ingredientBase}/${slug}/`;
    const next: Span[] = [];
    for (const span of spans) {
      if (span.slug) {
        next.push(span);
        continue;
      }
      const lower = span.text.toLowerCase();
      const idx = lower.indexOf(pattern.toLowerCase());
      if (idx === -1) {
        next.push(span);
        continue;
      }
      if (idx > 0) next.push({ text: span.text.slice(0, idx) });
      next.push({ text: span.text.slice(idx, idx + pattern.length), slug, href });
      const tail = span.text.slice(idx + pattern.length);
      if (tail) next.push({ text: tail });
    }
    spans = next;
  }

  return spans
    .map((s) =>
      s.href
        ? `<a href="${s.href}" class="underline decoration-dotted underline-offset-2 text-amber-700 hover:text-amber-900">${escapeHtml(s.text)}</a>`
        : escapeHtml(s.text),
    )
    .join("");
}

export async function getRecipeUsedIn(
  recipeSlug: string,
  recipeCollection: RecipeKind,
  localePrefix: string,
): Promise<Array<{ name: string; href: string; kind: RecipeKind }>> {
  const [allMeta, recipes, spicemixes, sauces] = await Promise.all([
    getCollection("meta"),
    getCollection("recipes"),
    getCollection("spicemixes"),
    getCollection("sauces"),
  ]);

  const byKind: Record<RecipeKind, Map<string, string>> = {
    recipes: new Map(recipes.map((r) => [r.id, r.data.name])),
    spicemixes: new Map(spicemixes.map((r) => [r.id, r.data.name])),
    sauces: new Map(sauces.map((r) => [r.id, r.data.name])),
  };

  return allMeta
    .filter((entry) =>
      entry.data.ingredientLinks.some(
        (l) => l.kind === "recipe" && l.slug === recipeSlug && l.collection === recipeCollection,
      ),
    )
    .map((entry) => {
      const slash = entry.id.indexOf("/");
      if (slash === -1) return null;
      const kind = entry.id.slice(0, slash) as RecipeKind;
      const slug = entry.id.slice(slash + 1);
      if (!(kind in byKind)) return null;
      const name = byKind[kind].get(slug);
      if (!name) return null;
      return { name, href: `${localePrefix}/${kind}/${slug}/`, kind };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function resolveRefs(
  refs: MetaRef[],
  localePrefix: string,
): Promise<Array<{ name: string; href: string }>> {
  const results = await Promise.all(
    refs.map(async ({ collection, slug }) => {
      let name: string | undefined;
      if (collection === "recipes") {
        const e = await getEntry("recipes", slug);
        name = e?.data.name;
      } else if (collection === "spicemixes") {
        const e = await getEntry("spicemixes", slug);
        name = e?.data.name;
      } else {
        const e = await getEntry("sauces", slug);
        name = e?.data.name;
      }
      if (!name) return null;
      return { name, href: `${localePrefix}/${collection}/${slug}/` };
    }),
  );
  return results.filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function resolveVariants(
  kind: RecipeKind,
  slugs: string[],
  localePrefix: string,
): Promise<Array<{ name: string; href: string }>> {
  const results = await Promise.all(
    slugs.map(async (slug) => {
      let name: string | undefined;
      if (kind === "recipes") {
        const e = await getEntry("recipes", slug);
        name = e?.data.name;
      } else if (kind === "spicemixes") {
        const e = await getEntry("spicemixes", slug);
        name = e?.data.name;
      } else {
        const e = await getEntry("sauces", slug);
        name = e?.data.name;
      }
      if (!name) return null;
      return { name, href: `${localePrefix}/${kind}/${slug}/` };
    }),
  );
  return results.filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function getUsedIn(
  ingredientSlug: string,
  localePrefix: string,
): Promise<Array<{ name: string; href: string; kind: RecipeKind }>> {
  const [allMeta, recipes, spicemixes, sauces] = await Promise.all([
    getCollection("meta"),
    getCollection("recipes"),
    getCollection("spicemixes"),
    getCollection("sauces"),
  ]);

  const byKind: Record<RecipeKind, Map<string, string>> = {
    recipes: new Map(recipes.map((r) => [r.id, r.data.name])),
    spicemixes: new Map(spicemixes.map((r) => [r.id, r.data.name])),
    sauces: new Map(sauces.map((r) => [r.id, r.data.name])),
  };

  return allMeta
    .filter((entry) => entry.data.ingredientLinks.some((l) => l.slug === ingredientSlug))
    .map((entry) => {
      const slash = entry.id.indexOf("/");
      if (slash === -1) return null;
      const kind = entry.id.slice(0, slash) as RecipeKind;
      const slug = entry.id.slice(slash + 1);
      if (!(kind in byKind)) return null;
      const name = byKind[kind].get(slug);
      if (!name) return null;
      return { name, href: `${localePrefix}/${kind}/${slug}/`, kind };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
