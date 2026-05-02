# 2026-05-02 — Foundation & content model

**Format:** `/grill-with-docs` Q&A interview, paused mid-session.
**Status:** ongoing — see `open-questions.md` for the queue.
**Outputs this session:** `/CONTEXT.md` created with locked glossary
and relation taxonomy.

## Why this session

The project went from greenfield to "a good amount of code" without
ever stopping to write down what it is, who it's for, and which
architectural decisions came out of which research. Result: code
treats five collections as siblings, schemas have prototyping cruft
(`goesWellWith`, `usesBase`, `featuredIn`, authored `variants[]`),
README is the Vite+ scaffold default, no `CONTEXT.md` exists.

Goal: lay foundations, document where we are, identify gaps, plan
next features.

## Reference material reviewed at session start

- `/docs/adr/0001-schema-org-is-storage-format.md` — schema.org
  Recipe is the canonical storage format; site-specific fields
  live in `.meta.json` sidecars.
- `/docs/plans/content-architecture.md` — five-collection split
  (`recipes`, `spicemixes`, `sauces`, `meta`, `ingredients`) plus
  later `pairings`. Predates pairings/ingredient-meta/pairing-meta
  collections that are now in code.
- `/docs/plans/admin-section.md` — admin UI plan, mostly executed.
- `/docs/plans/recipe-ingestion.md` — `recipe-ingestion` package
  plan, executed.
- Code state: 5 content collections (`recipes`, `spicemixes`,
  `sauces`, `ingredients`, `pairings`) plus 3 sidecar collections
  (`meta`, `ingredientMeta`, `pairingMeta`); admin UI under
  `/admin/*` (localhost-gated); EN/DE bilingual public site;
  packages `recipe-ingestion`, `content-ai`, `utils`.

## Discussion

### Q1 — Content hierarchy

Tension: user's brief said "spicemixes and sauces first-class,
recipes secondary, ingredients drive pairings"; code treats all
five collections as siblings (single shared `recipeMetaSchema`,
single shared `RecipeForm`).

**Options considered:**

- A) Two-tier flat (primary: ingredients/spicemixes/sauces/pairings;
  secondary: recipes; standalone recipes rejected).
- B) Spice-graph with recipes as illustrations — graph of ingredients
  - pairings is the core; spicemixes/sauces/recipes are equal-rank
    manifestations of the graph.
- C) Status-quo flat — keep five sibling collections; editorial
  focus is on quality, not on tier.

**Resolution: B**, with the refinement that **the graph is an
editorial-workflow + presentation concern, not a storage-shape
concern.** Storage stays uniform per collection. Encyclopedia value
(per-ingredient origin, flavor, medicinal/health depth) coexists
with graph value (relations).

### Q2 — Distinguishing axis between spicemix / sauce / recipe

Tension: three collections share schema; nothing in code says what
makes a sauce a sauce vs a spicemix vs a recipe. New types
(rubs, marinades, oils, pickles, pastes) have no obvious home.

**Options considered:**

- A) State of matter (dry vs wet vs finished dish).
- B) **Reusability scope** — composed-and-stored-and-reused vs
  terminal-and-eaten. Spicemix and sauce are reusable
  _components_; recipes are terminal _meals_. The dry/wet axis
  becomes a sub-distinction within components.
- C) Cuisine role — collapse spicemix and sauce into "preparation",
  keep recipe separate.

**Resolution: B.** Reusability is the user-meaningful axis: people
search for spicemixes and sauces because they want pantry building
blocks. Recipes are one-shot.

### Q3 — Number of recipe-shaped collections

Tension: three folder collections (`recipes`, `spicemixes`,
`sauces`) all share `recipeSchema`; folder split is purely
organizational. New types would need new collections.

**Options considered:**

- A) Status quo, three collections.
- B) Collapse spicemix+sauce into `components` (with closed
  `componentKind` enum), keep `recipes` separate.
- C) Total collapse: one `compositions` collection, `kind`
  discriminates.

**Initial resolution: B** with closed `componentKind` enum
(schema-validated, since front-end filtering and routing depend
on it).

**Subsequent re-framing (this session):** the user noted that
"in the end, [a component] is just an ingredient." Composed things
(ras-el-hanout, harissa) function as ingredients themselves —
you put ras-el-hanout into a meal you cook. This dissolved the
"component vs ingredient" glossary distinction and triggered Q5
below to reopen the storage shape question.

### Q4 — Relation taxonomy

Tension: schema had six relation flavors (`pairings`,
`ingredientLinks` for ingredients, `ingredientLinks` overloaded
for composition refs, `goesWellWith`, `usesBase`, `variantOf` +
authored `variants[]`). Inconsistent — some symmetric, some
directional, some redundant. Most were prototyping cruft.

User reframe: pairings were the only first-class relation that's
right in code today. Everything else was prototyping. The
pairing concept is "favorable taste" between two ingredients —
that's `goesWellWith` semantically, but only at the ingredient
level.

For higher-level entities (composed ingredients, recipes), the
"this goes with that" / "uses base" / "featured in" distinctions
all collapse into one relation: **a recipe-bearing entity uses
ingredients (atomic or composed)**, and the inverse ("which
recipes feature this composed ingredient") is computed at read
time.

**Resolution:** three relations, all others derived. See
`/CONTEXT.md` for the canonical table.

| Relation                   | Type                                                                  | Authored on                   | Inverse computed at                                    |
| -------------------------- | --------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `pairing`                  | symmetric (ingredient ↔ ingredient)                                   | `pairings` collection         | both endpoints' ingredient pages                       |
| `uses` (`ingredientLinks`) | directional (recipe-bearing → ingredient)                             | meta sidecar of the user side | linked ingredient's "used in" / "featured in" sections |
| `variantOf`                | directional (recipe-bearing → recipe-bearing, same kind, same locale) | meta sidecar of the child     | parent's "variants of this" list                       |

**Killed:** `goesWellWith`, `usesBase`, `featuredIn`, authored
`variants[]`. Do not reintroduce without an ADR.

### Q4.5 — Variant model

Initially I miscategorized variants as cruft and proposed dropping
them. User corrected: variants are key. Multiple recipes for the
same conceptual thing (mango chutney spicy/sweet/British-pickle;
yellow/red/brown curry; Heinz/banana/fermented ketchup).

**Options considered:**

- A) `variantGroup: <slug>` shared on peers — peer model, no
  canonical, group slug is shared.
- B) `variantOf: <slug>` directional — GitHub-fork mental model.

**Resolution: B.** User reasoning: A doesn't scale (groups
proliferate), and editorial story for B is clearer — when adding
new content, the editor's question is "is this a fork of
something I already have?" which is directional.

**Constraints (locked):**

- Allowed only on recipe-bearing entities (composed ingredients,
  recipes). Disallowed on atomic ingredients — different cardamom
  varieties are separate records, not variants.
- Same-kind only (sauce↔sauce, spicemix↔spicemix, recipe↔recipe).
- Within-locale only. Cross-locale linking is `translationOf`.
- Stored on the child as `variantOf: <slug>`. Parent's
  `variants[]` is computed at read time.

**Editorial UX implication parked for later:** admin should
AI-suggest "this looks similar to ras-el-hanout — fork it as a
variant?" when an editor creates a new entity. See implications
list.

## Decisions locked this session

1. **Project identity** — spice-first cooking site, value prop is
   the spice graph; encyclopedia depth + graph relations coexist;
   recipes are secondary illustrations.
2. **Glossary** — ingredient (atomic + composed), recipe, pairing,
   variant, the graph. Captured in `/CONTEXT.md`.
3. **Reusability axis** distinguishes composed ingredients
   (stored, reused) from recipes (terminal, eaten).
4. **Closed `kind` enum** for ingredient sub-types: atomic kinds
   (`spice`, `herb`, `seed`, `salt`, `acid`, `allium`,
   `dried-fruit`, `other`) and composed kinds (`spicemix`,
   `sauce`, `rub`, `pickle`, `oil`, `paste`, …). Schema-validated.
5. **Three relations only** — `pairing`, `uses`, `variantOf`.
   Everything else is computed.
6. **Variant model** — directional fork pointer, child-stored,
   same-kind same-locale, recipe-bearing entities only.
7. **Phase 1 vs Phase 2 framing** — Phase 1 is single editorial,
   localhost-gated admin, AI-assisted, high quality bar.
   Phase 2 is community curation; explicitly out of scope for
   foundation work.
8. **AI-suggests-editor-decides** as editorial principle. Narrow
   high-confidence auto-applies are allowed; the boundary needs
   an ADR (see open questions).
9. **Schema.org first** — composed ingredients and recipes use
   schema.org Recipe JSON-LD as canonical storage. Site-specific
   data lives in `.meta.json` sidecars. (Existing ADR 0001 stands;
   the new model extends it: composed ingredients also use
   Recipe JSON-LD when their `kind` carries a recipe.)

## Decisions proposed but NOT locked

### Q5 — Storage collapse for ingredients

Originally answered B (split `components` from `ingredients`).
Re-opened by glossary unification: if a composed thing is just an
ingredient, why separate collections?

- **B′** — keep `ingredients` and `components` separate
  collections, share schema fields where possible, treat as one
  umbrella in admin/public UI.
- **B″** — single `ingredients` collection with `kind`
  discriminator; atomic vs composed kinds drive whether
  recipe-shaped fields are present (Zod discriminated union).

Recommendation: **B″**. Pending user confirmation before any
schema work or content migration.

## Implications — candidate features / changes

These are the build implications visible after this session. Each
becomes a PRD or an issue in a later step. Items marked **(blocked
on Q5)** depend on the storage-shape decision.

### Schema & data model

- **(blocked on Q5)** Collapse or align `spicemixes` and `sauces`
  collections under the `ingredients` umbrella with a closed `kind`
  enum discriminator.
- Drop `goesWellWith`, `usesBase`, `featuredIn` from
  `recipeMetaSchema`. Migrate any populated content (none in demo
  set) by mapping into `ingredientLinks`.
- Drop authored `variants[]` from meta schema; keep `variantOf`
  on the child. Compute `variants[]` at read time in
  `recipe-augment.ts`.
- Add `variantOf` enforcement: only allowed when the entity is
  recipe-bearing (composed ingredient or recipe). Schema-level
  refinement.
- Add encyclopedia depth fields to atomic ingredients
  (medicinal uses, health benefits, cultural origin notes,
  botanical info) — see Q6 in open questions for exact shape.
- Ensure `pairings` collection accommodates composed ingredients
  as endpoints, not just atomic. (Already does at the schema
  level; verify at the resolution / page-rendering level.)

### Admin UI

- Variant fork affordance: when creating a new composed
  ingredient or recipe, AI suggests "this looks similar to <X> —
  fork it as a variant?" Sets `variantOf` automatically on
  acceptance.
- Remove form fields for killed relations (`goesWellWith`,
  `usesBase`, `featuredIn`).
- For composed ingredients, the form is the existing `RecipeForm`
  driven by `kind`; for atomic ingredients, the existing
  `IngredientForm`. Either route via a single entry that branches
  on `kind`, or keep two and route at the URL level.
- Pairings as a first-class admin surface — already partially
  built; ensure it's prominent, not buried under ingredients.

### Public site

- Composed ingredient pages render encyclopedia view first
  ("what is harissa?"), with a "How to make it" recipe section
  below — not as recipe pages.
- Atomic ingredient pages stay encyclopedia-first.
- Recipes get a more secondary nav treatment — they're examples,
  not the destination.
- Pairing pages become a primary navigation surface (today they
  surface inline on ingredient pages; consider a top-level
  `/pairings/` index and per-pairing detail pages).
- "Variants of this" rendering on every recipe-bearing entity's
  page, computed from `variantOf` inverse.
- "Used in / featured in" rendering on every ingredient page,
  computed from `ingredientLinks` inverse.

### Editorial discipline

- On-site recipes must reference at least one primary entity
  (composed ingredient via `ingredientLinks`, or feature a
  notable atomic ingredient). Enforce in admin save action.
  Third-party recipes are linked, not authored — so this rule
  applies only to fully-authored recipes.

### Documentation

- Write ADR(s) once Q5 lands, covering: unified ingredient
  collection (if B″), closed `kind` enum, relation taxonomy
  reduction, variant model.
- Rewrite `README.md` from Vite+ scaffold default to a project
  README that points to `CONTEXT.md`, `docs/adr/`, and the admin
  experience.
- Mark `docs/plans/content-architecture.md` as **superseded** by
  the new model once locked. Keep the file for historical context.

## Open questions for next session

See `open-questions.md`. Top of queue:

1. **Q5** — storage collapse B′ vs B″ (pending user
   confirmation; recommendation B″).
2. **Q6** — encyclopedia depth on ingredients: which fields,
   data sourcing.
3. **Q7** — multilingual model: independent vs synced
   translations, third-locale story.
4. **Q8** — AI auto-apply boundary (becomes an ADR).
5. **Q9** — public site IA: how the graph appears to a reader.
6. **Q10** — persistence beyond LocalFsStore.
7. **Q11** — Phase-1-to-Phase-2 transition criterion.
8. **Q12** — README rewrite (depends on Q5–Q11).

## Glossary deltas this session

Added to `/CONTEXT.md`:

- Ingredient (umbrella) with atomic / composed sub-distinction
- Recipe (terminal preparation)
- Pairing (symmetric flavor-affinity)
- Variant (directional fork)
- The graph (editorial + presentation, not storage)
- Phase 1 vs Phase 2

Removed from glossary (never made it in): "component",
"composition" — both rejected as redundant with the unified
"ingredient" umbrella.
