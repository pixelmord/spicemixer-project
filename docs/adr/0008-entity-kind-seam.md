# EntityKind discriminator unifies code-side workflow concerns

The admin code paths converge on a single code-side discriminator,
`EntityKind = "ingredient" | "recipe" | "pairing"`. The three values
unify the workflow concerns shared by these peer concepts — draft
state, AI suggestions, audit log, completeness scoring, translations.
Per-kind specifics (schema, proposer functions, diff, completeness
ruleset) live in a registry behind the seam. Shared mechanics (form
state hook, AI orchestration runner, auto-apply policy) live above it.

## Why three values, not four

CONTEXT.md names four content concepts (Ingredient, Mixture, Recipe,
Pairing). The naive split would mirror that naming.

**Locked: three values.** `recipes/` and `mixtures/` both map to
`EntityKind = "recipe"`. Reasons:

- **They share the storage shape.** ADR 0001 fixes both collections to
  schema.org Recipe JSON-LD with a meta sidecar. The schema, the AI
  proposers, the diff function, and the completeness ruleset are
  identical between them. A 4-way split degenerates: every dispatch
  site reduces to today's `if (collection === "recipes" || collection
=== "mixtures")` branch, just one level deeper.
- **CONTEXT framing matches.** "A recipe for a mixture vs. a recipe for
  a dish" — same code shape, different editorial intent. The
  Mixture-vs-Recipe split is a content-modeling distinction (already
  locked in ADR 0002), not a code-shape distinction.
- **Routing is a separate concern.** Where the entry lives on disk
  (`mixtures/` vs `recipes/`) and which URL prefix it serves
  (`/mixtures/<kind>/` vs `/recipes/`) is caller business, carried as
  metadata on the EntityRef, not as the workflow discriminator.

The per-kind config registry surfaces a `routePrefix` field for
convenience; it is not part of the workflow contract.

## Why Pairing sits inside the seam

Pairings are structurally unlike the other two: an edge with two
endpoints, identity `slug-a--slug-b`, dual-locale `descriptions: { en,
de }` inline (ADR 0003 exception). The case for excluding Pairing was
real.

**Locked: Pairing in.** Reasons:

- **Workflow concerns are identical.** Pairings carry draft state, AI
  suggestions, audit log, completeness, translations. Every concern
  the seam unifies applies.
- **The triplication today already includes Pairing** —
  `PairingForm`, `PairingEnhanceModal`, `curate-pairing`,
  `pairing-diff`, `aiRefreshPairingSuggestions`. Excluding it from the
  seam preserves that duplication.
- **2-way unification is not worth a seam.** Ingredient + Recipe alone
  is two branches; the depth payoff of a registry doesn't clear the
  cost.
- **The schema asymmetry is contained.** "Two endpoints, dual-locale
  descriptions" is a schema concern. The seam's contract is
  workflow-shaped (`getMeta`, `appendEvent`, `score`,
  `proposeImprovements`); it does not care that Pairing's identity is
  composite.

## Behind the seam vs. above it

Per-kind config registry (behind the seam):

- `schema` — Zod schema validator
- `proposers` — AI proposer function map
- `diff` — entity-shape-aware diff function
- `completeness` — required + recommended field sets, score-to-tier
  mapping
- `routePrefix` — caller-side convenience, not workflow contract

Shared mechanics (above the seam):

- `useEntityFormState(kind, ...)` — slug check, draft toggle,
  completeness scoring, shared field-array state
- `runAiRefresh(kind, ...)` — AI orchestration runner consuming
  `EntityKind` + `AiEventLog`
- Auto-apply policy — global per ADR 0004, kind-agnostic

## Headless contract — forms stay distinct

The seam is behaviour-only. The rendered field set differs genuinely
per kind (an Ingredient form has no `recipeIngredient` array; a
Pairing form has two endpoint pickers). A generic `<Form kind={...}>`
that renders all fields under conditionals would be dishonest — the
fields don't share enough shape.

`RecipeForm`, `IngredientForm`, `PairingForm` remain separate
components. They become thin: each binds the headless hook + payload
builder from the seam, then renders kind-specific JSX.

## Module location

`packages/entity-kind` — separate workspace package, importable by
both `apps/website` and `packages/content-ai`. Forces a clean
dependency direction: `content-ai` depends on `entity-kind`; `apps/
website` depends on both. No circular dependencies.

## Alternatives rejected

- **4-way split (Ingredient / Mixture / Recipe / Pairing).** Mirrors
  CONTEXT vocabulary but Mixture and Recipe share their entire code
  shape. The dispatch reproduces today's collection-branch one layer
  deeper. The seam earns nothing.
- **2-way split (Pairing handled separately).** Only unifies
  Ingredient + Recipe. A two-branch dispatch doesn't justify a
  registry; preserves the Pairing triplication.
- **Generic `<Form kind={...}>` that renders all fields.** The field
  sets differ genuinely. A unified renderer becomes a giant
  conditional, harder to reason about than three honest forms binding
  the same headless hook.
- **Discriminate on `collection` directly (no EntityKind type).**
  Couples workflow shape to storage routing. New kinds, or
  re-routings of existing kinds (e.g. an `oils` sub-collection of
  mixtures), would require workflow-code changes.
- **EntityKind lives inside `packages/content-ai`.** Forces
  `apps/website` to depend on `content-ai` for what is fundamentally
  a workflow type, not an AI type. Backwards dependency direction.

## Consequences

### Code

- `packages/entity-kind` exists with the discriminator type, the
  registry interface, and three registered entries (`ingredient`,
  `recipe`, `pairing`) populated from today's per-kind schema /
  proposers / diff / completeness modules. Centralisation only — no
  new logic in the foundation slice (issue #61).
- `packages/content-ai` depends on `entity-kind`. The curate scripts
  (`curate-ingredient.ts`, `curate-recipe.ts`, `curate-pairing.ts`)
  collapse onto a single `runCurate(kind, ...)` consumer of the
  registry (issue #55).
- `apps/website/src/actions/index.ts` AI refresh handlers
  (`aiRefreshIngredientSuggestions`, `aiRefreshRecipeSuggestions`,
  `aiRefreshPairingSuggestions`) collapse onto a single
  `runAiRefresh(kind, ...)` runner consuming the registry +
  `AiEventLog` from ADR 0009 (issue #64).
- Form components stay separate but bind a shared
  `useEntityFormState(kind)` hook (issue #52).
- Enhance modals collapse onto a single `<EnhanceModal kind={...}>`
  (issue #53).
- Diff React components collapse onto a single `<EntityDiff
kind={...}>` (issue #56).

### Adding a new entity kind

Becomes: register one entry in `packages/entity-kind` + author one
form component. No edits to the AI runner, no edits to the curate
script, no new diff component, no new enhance modal.

### Open follow-ups

- The `EntityRef` type (`{ collection, slug }`) and `EntityKind` are
  related but not identical — `collection` is the routing
  concern, `kind` the workflow discriminator. The mapping
  (`collectionToKind: { ingredients: "ingredient", recipes: "recipe",
mixtures: "recipe", pairings: "pairing" }`) lives in the registry.
  Whether `EntityRef` should carry both fields, or derive `kind` from
  `collection`, is a follow-up. Default: derive, single source.
- The `metaSidecarShape` registry field is transitional — it
  disappears once ADR 0009's parallel-file convergence lands and
  ingredient meta stops being locale-keyed.

## Reference

Decided in the 2026-05-04 architecture-improvement grilling session
following the codebase intelligence pass. Replaces the pre-seam
issue tracking (issue #54 closed; #52, #53, #55, #56 retitled as
slices of this arc; #61 is the foundation issue, #64 the runner).
