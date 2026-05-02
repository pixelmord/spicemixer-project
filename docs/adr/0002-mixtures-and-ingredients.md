# Mixtures and ingredients are peer collections, unified at the reference layer

Atomic ingredients (cardamom, sumac, sea salt) and mixtures (harissa,
ras-el-hanout, BBQ rub, infused oil) are stored in **two separate
collections with two separate schemas**, not one collection with a
discriminated union. They share a common reference type — `{
collection: "ingredients" | "mixtures", slug: string }` — used wherever
content links across the boundary (`recipeIngredient`, `ingredientLinks`,
pairing endpoints).

`mixtures` replaces the prior `spicemixes` and `sauces` collections and
absorbs the broader composed-ingredient kinds.

## Why separate collections

Atomic ingredients and mixtures look superficially similar (both can
appear in a recipe's ingredient list) but their data shapes are
genuinely different:

- **Mixtures** are stored as schema.org Recipe JSON-LD (per ADR 0001)
  with a meta sidecar — they have steps, yield, ingredient lists, times.
- **Atomic ingredients** carry encyclopedic depth: structured taxonomy
  (botanical name, family, parts, flavor profile, safety flags) plus
  long-form markdown sections (description, history, medicinal uses,
  health benefits, safety notes, culinary use, storage, sourcing).
  No recipe.

Forcing both into a single `ingredients` collection with a discriminated
union on `kind` produces a schema where the majority of fields are
nullable per kind. The type pressure pays off only for the small subset
of code that wants to treat both uniformly — which is precisely the use
case the reference encoding solves.

## The closed `kind` enum

`mixtures.kind ∈ { spicemix, sauce, rub, oil, pickle, chutney, marinade
}`. Schema-validated and closed; adding a kind is a schema change
because front-end filtering, routing (`/mixtures/<kind-plural>/`), and
form templates depend on it.

`ingredients.category ∈ { spice, herb, seed, salt, acid, allium,
dried-fruit, other }`. Unchanged from prior schema.

## The reference encoding

`{ collection: "ingredients" | "mixtures", slug: string }` is used by:

- `recipeIngredient` items in mixtures and recipes (a recipe's
  ingredient line can point at cardamom _or_ harissa).
- `ingredientLinks` items in meta sidecars (a recipe-bearing entity
  uses these underlying entries).
- `pairing` endpoints — a pairing can span ingredient ↔ ingredient,
  ingredient ↔ mixture, or mixture ↔ mixture.

Slug uniqueness is **per-collection**. Cross-collection collisions
(e.g. `mint` exists in both) are surfaced in admin as a soft warning
but not blocked — disambiguation happens via the `collection` field.

## Routes

- `/mixtures/<slug>/` — detail page.
- `/mixtures/<kind-plural>/` — kind-filtered index (`/mixtures/sauces/`,
  `/mixtures/rubs/`, …). Plural kind names are reserved from the
  mixture slug pool to avoid path collision.
- `/mixtures/` — full index.
- `/spicemixes/<slug>/` and `/sauces/<slug>/` — 301 redirect to
  `/mixtures/<slug>/` for backward compatibility.
- `/ingredients/<slug>/` — atomic ingredient detail (unchanged).

## Forms

`RecipeForm` is shared by mixtures and recipes (same schema.org Recipe
shape; the meta-sidecar `kind` differentiates target collection).
`IngredientForm` remains for atomic ingredients (different schema).
The new-entity entry route in admin branches on
Ingredient / Mixture / Recipe and dispatches to the appropriate form.

## Consequences

- ADR 0001 (schema.org Recipe is canonical storage) **applies to
  mixtures and recipes only**. Atomic ingredients use a leaner
  non-Recipe encyclopedia shape.
- The five-collection content split from the original
  `docs/plans/content-architecture.md` is superseded. The new shape
  is: `ingredients`, `mixtures`, `recipes`, `pairings`, plus their
  meta-sidecar siblings.
- All content under `spicemixes/` and `sauces/` must migrate to
  `mixtures/` with `kind` set. Existing meta sidecars likewise.
- All `ingredientLink.collection` references in authored content must
  update from the prior `["recipes", "spicemixes", "sauces"]` enum to
  `["ingredients", "mixtures"]` (or the corresponding recipe-bearing
  collections where the link points at a recipe). The encoding is
  uniform; only the enum widens.
- "Composed ingredient" as a glossary term is retired. Use "mixture."
  CONTEXT.md is the canonical glossary.

## Reference

Decided in the 2026-05-02 continued session. Full discussion:
`docs/research/2026-05-02-content-model-continued.md`, sections
Q5 and Q5b–d.
