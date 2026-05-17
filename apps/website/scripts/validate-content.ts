// Imports from entity-kind source to avoid requiring a built dist under
// node --experimental-strip-types.
import { LocalFsStore } from "../src/lib/stores/local-fs.ts";
import {
  validateSlugUniqueness,
  validateVariantsClosure,
} from "../../../packages/entity-kind/src/validators.ts";

const store = new LocalFsStore();

function slugFromId(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

const [ingredients, mixtures, recipes, metaItems] = await Promise.all([
  store.list("ingredients"),
  store.list("mixtures"),
  store.list("recipes"),
  store.list("meta"),
]);

const dedup = (items: { id: string }[]) => [...new Set(items.map((i) => slugFromId(i.id)))];

const slugsByCollection = {
  ingredients: dedup(ingredients),
  mixtures: dedup(mixtures),
  recipes: dedup(recipes),
};

const canonicalVariants: Record<string, string[]> = {};

for (const item of metaItems) {
  const meta = item.data as Record<string, unknown>;
  const canonicalLocale = meta["canonicalLocale"];
  if (!canonicalLocale || meta["translationOf"]) continue;

  const [, locale, slug] = item.id.split("/");
  if (!slug || locale !== canonicalLocale) continue;

  canonicalVariants[slug] = Array.isArray(meta["variants"]) ? (meta["variants"] as string[]) : [];
}

const slugConflicts = validateSlugUniqueness(slugsByCollection);
const variantsViolations = validateVariantsClosure(canonicalVariants);

let ok = true;

if (slugConflicts.length > 0) {
  ok = false;
  console.error(`\n[validate] Cross-collection slug conflicts (${slugConflicts.length}):`);
  for (const c of slugConflicts) {
    console.error(`  slug "${c.slug}" appears in: ${c.collections.join(", ")}`);
  }
}

if (variantsViolations.length > 0) {
  ok = false;
  console.error(`\n[validate] Variants closure violations (${variantsViolations.length}):`);
  for (const v of variantsViolations) {
    if (v.reason === "not-found") {
      console.error(
        `  "${v.entity}".variants contains "${v.variant}" which has no canonical-locale meta`,
      );
    } else {
      console.error(
        `  "${v.entity}".variants contains "${v.variant}" but "${v.variant}".variants does not include "${v.entity}"`,
      );
    }
  }
}

if (ok) {
  console.log("[validate] OK — no content violations found.");
} else {
  process.exit(1);
}
