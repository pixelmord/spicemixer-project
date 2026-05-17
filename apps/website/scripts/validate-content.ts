/**
 * Build-time content validator. Checks:
 *   1. Cross-collection slug uniqueness (ingredients / mixtures / recipes)
 *   2. Variants closure symmetry (canonical-locale meta)
 *
 * Run via: vp run validate-content
 * Exit code 1 if any violations found.
 *
 * Imports validators from entity-kind source directly to avoid requiring a
 * built dist when running under node --experimental-strip-types.
 */
import { LocalFsStore } from "../src/lib/stores/local-fs.ts";
import {
  validateSlugUniqueness,
  validateVariantsClosure,
} from "../../../packages/entity-kind/src/validators.ts";

const store = new LocalFsStore();

// ── Collect slugs per collection (deduplicated across locales) ────────────────

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

// ── Collect canonical variants ────────────────────────────────────────────────

const canonicalVariants: Record<string, string[]> = {};

for (const item of metaItems) {
  const meta = item.data as Record<string, unknown>;
  const canonicalLocale = meta["canonicalLocale"];
  if (!canonicalLocale || meta["translationOf"]) continue;

  // Meta id: "kind/locale/slug" — locale is [1], slug is [2]
  const parts = item.id.split("/");
  const locale = parts[1];
  const slug = parts[2];
  if (!slug || locale !== canonicalLocale) continue;

  canonicalVariants[slug] = Array.isArray(meta["variants"]) ? (meta["variants"] as string[]) : [];
}

// ── Run validators ────────────────────────────────────────────────────────────

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
