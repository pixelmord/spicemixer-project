# Relation taxonomy collapse — Pairing as universal editorial relation, variants as equivalence group

The 2026-05-16 grilling session on pairings-versus-relationships
(`docs/research/2026-05-16-pairings-vs-relationships.md` — sibling to the
translation flow research) walked the existing relation-shape sprawl
and collapsed it to a single architectural axis:

> **Editorial relations are entities. Navigational relations are bare refs.**

Anything with authored prose explaining _why two things go together_
lives in the `pairings` collection as a first-class entity with full
per-locale storage, translation flow, and editorial history.
Anything without prose — just "X is related to Y" — lives as a slug
ref on the meta sidecar.

This collapses five shapes into two. See the relation-taxonomy table
in CONTEXT.md for the post-collapse picture.

## What collapses

### `goesWellWith` (recipe meta) → Pairing entity

The `goesWellWith: array(recipeLinkRef)` field on `recipeMetaSchema` is
deleted. Existing AI flow ("here are recipes/mixtures this entity goes
well with") moves to creating Pairing entities via a new
`CreatePairingDialog` block in the registry, invoked from the recipe
form's AI suggestion section.

The AI rationale text — today generated into
`aiSuggestions.relations[].rationale` and **discarded** on accept (see
`apps/website/src/components/admin/RecipeForm.tsx:1865`) — becomes the
new Pairing's `description`. The pattern that surfaced this collapse:
the AI was already proposing editorial prose per relation; the schema
just had nowhere to put it.

### `usesBase` (recipe meta) → inverse of `ingredientLinks`

`usesBase: array(recipeLinkRef)` is the inverse of the existing
`ingredientLinks` field on recipe meta. Mixture X declaring "harissa is
my base" duplicates the information already encoded by
`ingredientLinks: [{ slug: "harissa", ... }]` on X. The inverse "harissa
is base for X" is computable at read time by scanning
`ingredientLinks` across the recipe-bearing collections. The authored
field is deleted; the read-side surface ("featured in") remains.

### `ingredient.pairings` (inline note) → Pairing entity

The `ingredients` schema today carries an inline
`pairings: [{ slug, note? }]` field — a third pairing system covering
authoring on the ingredient side. It's empty in current content (we
checked). With the Pairing collection widened to accept any endpoint
kind, this inline pattern is redundant. Deleted entirely.

### `variantOf` (single parent) → `variants: string[]` (equivalence group)

The current schema has `variantOf: string` (the child points to its
parent) plus `variants: string[]` (a derived list, but stored). The fork
model assumes a canonical parent exists. The real culinary case is
exactly the opposite: harissa-moroccan and harissa-lebanese are
_siblings_ of the same concept, no parent. Same for chocolate-cake
variations, harira variants, ketchup styles.

Replaced by a symmetric equivalence group: `variants: string[]` lists
every other member, no parent ref. Closure-on-save in the save handler
unifies the transitive closure across every edit. Clusters merge
naturally when an editor links two members across previously-separate
groups; unlinking removes you from the entire class (no half-belonging).

Authored on the **canonical-locale meta only.** Translations carry no
`variants` field; they derive the list at read time by following
`translationOf` back to the canonical entity. This eliminates the
duplicate-authoring requirement that the current "within-locale only"
rule would have imposed.

## What survives

- **Pairing entity** — widened endpoints. Now `endpoints: tuple<endpointRef, endpointRef>`
  over `ingredients`+`mixtures`+`recipes`. Schema rename from
  `ingredients: tuple<string, string>` to `endpoints: tuple<endpointRef, endpointRef>`
  with `endpointRef = { collection, slug }`. Canonical id remains
  `<slugA>--<slugB>` alphabetically sorted by slug only, relying on the
  cross-collection slug uniqueness invariant (below).
- **`ingredientLinks` (recipe meta)** — unchanged. The structural
  recipe→ingredient/mixture reference. The "uses" relation. Inverse
  ("used in" / "featured in") computed at read time across all
  recipe-bearing collections.

## New invariants

### Cross-collection slug uniqueness

The flat pairing id (`<slugA>--<slugB>`) requires that any given slug
appear in at most one of `ingredients` / `mixtures` / `recipes`.
This is **de facto true** in current content (zero collisions checked
across the three collections), but never enforced. `vp check` gains a
validator: any slug duplicated across the three collections is a build
error. Catch at edit time, not at deployment.

### `featured: boolean` on pairing meta

Pairing index page (`/pairings/`) filters to `featured === true`.
Default `false` on the schema. The create-Pairing flow seeds it to
`true` for ingredient/mixture-only endpoint pairs (the editorial
flagship), `false` for any recipe-bearing pair. Editors override per
record. This is editorial convention encoded in the create UI, not a
schema-level rule.

Wide storage (all endpoint kinds in one collection, one translation
flow, one AI contract), narrow index (the flagship pairings index stays
curated, ingredient-focused, editorial).

### Variants closure invariant

Every member of a variant equivalence class lists every other member in
its `variants` array. `vp check` validates: for each entity X with
non-empty `variants`, every slug Y in X.variants must (a) exist as a
canonical-locale entity and (b) carry X in its own `variants` list.
Asymmetric links are build errors.

## Editorial UX

The create-Pairing dialog (new registry block `CreatePairingDialog`,
analogous to the `TranslateEntityDialog` from ADR 0015) opens when the
editor clicks "Add" on an AI-proposed pairing suggestion in the recipe
form's (or ingredient form's, or mixture form's) AI panel. Modal
pre-fills both endpoints, AI rationale as editable `description`,
`featured` checkbox (default false for recipe-bearing), locale picker
(default current form locale). Editor reviews, confirms, save → new
Pairing entity persists, `ingested` aiEvent fires on the new entity,
modal closes.

Recipe/ingredient/mixture forms gain a read-only "Pairings featuring
this entity" section, resolved from the pairings collection at form
load time, replacing the prior combobox-on-meta authoring.

Variants are authored from a dedicated section on the recipe/mixture
form. The save handler computes the closure and writes to every member's
canonical-locale meta.

## Considered alternatives (rejected)

- **Keep `goesWellWith` inline with descriptions.** Adding a `description`
  field to the existing ref shape preserves the single-sided authoring.
  Rejected because it permanently keeps two editorial relation shapes
  (Pairing entity for ingredients, ref-with-description for recipes),
  two translation paths, two AI contracts. Principle A's payoff was the
  collapse — accepting a second shape forfeits it.
- **Pairing index includes everything (wide storage, wide index).**
  Rejected because recipe-recipe pairings are thinner in editorial
  substance than ingredient-ingredient pairings and dilute the flagship
  index. The IA distinction (curation) is preserved at the render-time
  filter without compromising storage uniformity.
- **Variants as a separate `variant-groups` umbrella entity.** Each
  group becomes a content entity ("Harissa, the concept") with members
  pointing at it. Rejected because most variant relations don't deserve
  a concept page (chocolate-cake-as-concept is thin), and creates
  authoring pressure for umbrella descriptions that aren't real content.
  Reconsider if umbrella concepts become genuinely valuable later.
- **Variants as parent-child fork (the CONTEXT.md status quo).**
  Rejected because the fork model assumes a canonical parent exists,
  which it usually doesn't in culinary reality. The editor would have
  to pick an arbitrary "first" entity as parent — that's an editorial
  fiction not worth maintaining.

## Migration

Cheap because the content is throwaway. See
`docs/plans/2026-05-16-relation-taxonomy-collapse.md` for the sequence.
Headline points:

- Existing `goesWellWith` arrays are empty across all current recipe
  meta files. Migration is field-deletion only.
- The eight existing pairings migrate to the widened endpoint shape
  trivially (all current endpoints are ingredients, so `endpoints[i] = { collection: "ingredients", slug: existingSlugs[i] }`).
- `ingredient.pairings` inline notes are empty. Field-deletion only.
- `variantOf`/`variants` are empty across current content. Schema rev
  with no content migration.
- `featured: true` retroactively seeded on the eight existing pairings
  (all ingredient-only endpoints).

## Consequences

- The lift plan's `AiContract<S, Source>` for Pairing carries
  per-field `translation` behavior: `description` → translate;
  `endpoints[].slug`, `endpoints[].collection`, `featured`,
  `image`, `imageAttribution` (except `.attribution` text) → copy.
- The `goesWellWith` / `usesBase` AI proposers in
  `aiSuggestions.relations[]` become an `aiSuggestions.pairings[]`
  proposer that targets new-Pairing-entity creation, not
  same-entity-field append. The Option 2 dialog flow above is the
  acceptance UX.
- Recipe form's "Goes well with" combobox and "Uses base" combobox
  delete. The "Variant of" section gains an editor (none today).
- The CONTEXT.md "Relation taxonomy" table is the post-collapse
  reference; this ADR is the why.

## Reference

Decided in the 2026-05-16 pairings-versus-relationships grilling session.
Builds on ADR 0014 (folder-per-locale; the pairing storage shape this
ADR widens). Companion to ADR 0015 (translation flow; the
`CreatePairingDialog` block is a sibling to that ADR's
`TranslateEntityDialog`).
