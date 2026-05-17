/** Slug appears in more than one collection. */
export type SlugConflict = {
  slug: string;
  /** All collections in which this slug was found. */
  collections: string[];
};

/**
 * Validates that no slug appears in more than one of the given collections.
 *
 * Required because Pairing endpoints use { collection, slug } and the
 * canonical pairing id `<slugA>--<slugB>` relies on slug-uniqueness across
 * collections.
 */
export function validateSlugUniqueness(
  slugsByCollection: Readonly<Record<string, readonly string[]>>,
): SlugConflict[] {
  const slugToCollections = new Map<string, string[]>();

  for (const [collection, slugs] of Object.entries(slugsByCollection)) {
    const seen = new Set<string>();
    for (const slug of slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      const cols = slugToCollections.get(slug) ?? [];
      cols.push(collection);
      slugToCollections.set(slug, cols);
    }
  }

  return Array.from(slugToCollections.entries())
    .filter(([, cols]) => cols.length > 1)
    .map(([slug, collections]) => ({ slug, collections }));
}

/** A variants-closure asymmetry found on a canonical-locale entity. */
export type VariantsViolation = {
  /** The entity whose variants list contains an invalid entry. */
  entity: string;
  /** The slug from the variants list that caused the violation. */
  variant: string;
  /** Why the entry is invalid. */
  reason:
    | "not-found" // variant slug has no canonical-locale entity
    | "missing-back-link"; // variant exists but does not list entity in its own variants
};

/**
 * Validates variants closure symmetry.
 *
 * For every entity X with non-empty variants: every Y in X.variants must
 * (a) exist as a canonical-locale entity (key in canonicalVariants) and
 * (b) carry X in its own variants list.
 *
 * @param canonicalVariants Map of slug → variants[] for all canonical-locale entities.
 */
export function validateVariantsClosure(
  canonicalVariants: Readonly<Record<string, readonly string[]>>,
): VariantsViolation[] {
  const violations: VariantsViolation[] = [];

  for (const [entity, variants] of Object.entries(canonicalVariants)) {
    for (const variant of variants) {
      if (!(variant in canonicalVariants)) {
        violations.push({ entity, variant, reason: "not-found" });
      } else {
        const backVariants = canonicalVariants[variant] ?? [];
        if (!backVariants.includes(entity)) {
          violations.push({ entity, variant, reason: "missing-back-link" });
        }
      }
    }
  }

  return violations;
}
