# Spicemixer — Project Context

This file is the canonical glossary and project frame. When code or conversation
disagrees with this file, this file wins (or this file is wrong and should be
updated). Architecture decisions live in `docs/adr/`. Plans and proposals live
in `docs/plans/`. This file is for **shared language**, not implementation.

## What Spicemixer is

A spice-first cooking site. The value proposition is **the spice graph**:
which ingredients exist, where they come from, what they taste like, what
they pair with, and what you can make from them.

Concretely, the site is built around four things, in priority order:

1. **Ingredients** — atomic, buyable cooking items: spices, herbs, seeds,
   salts, acids, alliums, dried fruits. Encyclopedic depth lives here:
   origin, flavor profile, medicinal uses, health benefits, history,
   taxonomy. _No recipe; you don't "make" cardamom._
2. **Mixtures** — preparations you make once and reuse: spice mixes,
   sauces, rubs, oils, pickles, chutneys, marinades. Each is stored as a
   schema.org Recipe (ingredients + steps + yield + times) plus an
   encyclopedic meta sidecar. The brand-fit category — Spicemixer is, on
   its face, a mixture-first site. Editorial voice can lean into the
   chemistry-set framing.
3. **Pairings** — which ingredients (or mixtures) combine well, with
   editorial commentary explaining _why_. The headline relation.
4. **Recipes** — terminal preparations (a meal, eaten and gone). Secondary
   on this site. They exist to demonstrate ingredients and mixtures in
   use; they are not the destination. On-site recipes are accepted only
   when they showcase primary content. Third-party recipes are
   linked-and-attributed, not re-published.

A **mixture can be referenced as an ingredient** in a recipe's ingredient
list. The unification happens at the _reference layer_, not the storage
layer: ingredients and mixtures live in separate collections with
different schemas, but link targets in `recipeIngredient` /
`ingredientLinks` accept either.

The site is **not**:

- A general recipe collection.
- A community / UGC platform — at least not in Phase 1. See "Phases" below.
- A shopping site.

## Glossary

### Ingredient

An **atomic, buyable cooking item**. A single thing you pick up at a
market: cardamom, sumac, basil, sea salt, lemon juice, garlic. Kind ∈
{`spice`, `herb`, `seed`, `salt`, `acid`, `allium`, `dried-fruit`,
`other`}. No preparation steps, no recipe.

Schema is **structured taxonomy + long-form encyclopedia sections**:

- _Taxonomy (queryable):_ `name`, `commonNames`, `botanicalName`,
  `family`, `category`, `parts`, `region`, `origin`, `seasonality`,
  `flavorProfile`, `flavorNotes`, `safetyFlags`, `images`.
- _Sections (markdown, all optional):_ `summary`, `description`,
  `culinaryUse`, `medicinalUses`, `healthBenefits`, `safetyNotes`,
  `history`, `storage`, `sourcing`.
- _Sources:_ shared `sources[]` array per ingredient; inline
  `[text](url)` citations within sections.
- _Liability:_ page-level disclaimer auto-renders when any of
  medicinalUses/healthBenefits/safetyNotes is non-empty.

The "ingredient" term used to be the umbrella covering both atomic and
composed items. **It is now narrower:** atomic only. Composed items are
**Mixtures** (see below).

### Mixture

A preparation you make once and reuse — a spice blend, sauce, rub, oil,
pickle, chutney, marinade. Stored, kept, reused; not eaten as a single
meal. Each mixture has a recipe describing how to make it (schema.org
Recipe: ingredient list, steps, yield, times) **plus** an encyclopedic
meta sidecar (origin notes, when to use it, history, variants).

Kind ∈ {`spicemix`, `sauce`, `rub`, `oil`, `pickle`, `chutney`,
`marinade`}. Closed and schema-validated; adding a kind requires a
schema change, because front-end filtering and routing depend on it.

Mixtures carry `region[]` on the same closed-enum as ingredients (see
**Region**).

A mixture can be referenced as an ingredient in a recipe's ingredient
list — at the reference layer, mixtures and ingredients are
interchangeable link targets. At the storage layer they are separate
collections with separate schemas.

### Recipe

A terminal preparation — something you make and eat, not something you
store to use later. Distinct from a mixture by intent: a recipe's output
is a meal; a mixture's output is something that goes into _other_ things.

Recipes may be authored on-site (full content) or sourced third-party
(link + attribution + minimal local metadata). Third-party recipes are
_examples_ of how to use the ingredients the site features; they are not
owned content.

### Pairing

A symmetric flavor-affinity relation between two ingredient-or-mixture
endpoints. Has its own description explaining the affinity ("warm and
licorice-y, both lift custard desserts"). Authored once on a canonical id
(`slug-a--slug-b`, alphabetically sorted). Surfaced on both endpoints'
pages.

Pairings span ingredient ↔ ingredient, ingredient ↔ mixture, and mixture
↔ mixture freely — endpoints share a `(collection, slug)` reference
type.

### Region

A **culinary macro-region** — coarse, closed-enum, queryable. Drives the
worldmap and faceted search. Roughly 15–25 entries (e.g. `north-africa`,
`levant`, `mediterranean`, `south-india`, `east-asia`, `andean`). Carried
as `region[]` on ingredients, mixtures, and recipes — multi-valued
because cardamom belongs to South India _and_ Guatemala, harissa to
North Africa, fusion recipes to several.

**Distinct from:**

- `origin[]` (ingredients, free strings) — finer-grained provenance
  prose like "Kerala," "Guatemalan highlands." Not closed, not for
  faceting.
- `recipeCuisine` (mixtures, recipes, schema.org) — cuisine like
  "Italian," "Tunisian," "Sichuan." Cuisine ≠ region; Tunisian cuisine
  lives in the North Africa region.

**Pairings** do not carry `region[]`. A pairing's regions derive from the
union of its endpoints' regions at read time.

The exact enum list is deferred until seed content informs granularity;
schema commits to "culinary macro-region" granularity. Pure additions to
the enum are migration-free; splits or merges of an existing region
require a content migration.

### Variant

An alternative recipe for the same conceptual thing. Mango chutney comes
in spicy / sweet / British-pickle styles. Curry comes in yellow / red /
brown / Thai / Japanese. Ketchup has Heinz-style / banana / fermented.
Each is a legitimate recipe; none is "the canonical one."

Modeled as a directional **fork** relation, GitHub-style. The child
(the fork) carries `variantOf: <slug>` pointing to its parent. The
parent's variant list is computed at read time. Variants can chain: a
variant can itself have variants.

Constraints:

- Allowed only on recipe-bearing entities — **mixtures** and **recipes**.
  Disallowed on ingredients (atomic — different cardamom varieties are
  separate records, not variants).
- Same-kind only — sauce↔sauce, spicemix↔spicemix, recipe↔recipe. No
  cross-kind variant pointers.
- Within-locale only. Cross-locale linking is `translationOf`, a
  separate axis.

### The graph

The set of relations between ingredients, mixtures, pairings, and
recipes. Lives in the **editorial workflow** and the **public
presentation**, not in the storage shape. Storage stays uniform per
collection. The graph is authored implicitly (when you fill
`recipeIngredient` and link to slugs, or fork a parent into a variant)
and presented explicitly (the pairing page, the "used in" list on each
ingredient/mixture, the "variants of this" list on each recipe-bearing
entity).

### Editorial flow / draft state

Every primary entity (ingredient, pairing, recipe) has a draft state in
its meta sidecar. Drafts are visible only in admin; the public build
filters them out. The admin UI lets editors save-as-draft or publish.

## Relation taxonomy

Three relations exist. Everything else is computed.

| Relation                     | Type                                                                                 | Authored on                                         | Inverse computed at                                    |
| ---------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------ |
| **pairing**                  | symmetric, endpoints are `(collection, slug)` over `ingredients`+`mixtures`          | `pairings` collection (own entity, has description) | both endpoints' detail pages                           |
| **uses** (`ingredientLinks`) | directional (mixture OR recipe) → `(collection, slug)` over `ingredients`+`mixtures` | meta sidecar of the user side                       | the linked entity's "used in" / "featured in" sections |
| **variantOf**                | directional (recipe-bearing entity → recipe-bearing entity, same kind, same locale)  | meta sidecar of the child (the fork)                | parent's "variants of this" list                       |

The previous schema had `goesWellWith`, `usesBase`, `featuredIn`,
`variants[]`. They were prototyping cruft and have been collapsed away
(`variants[]` is now derived from `variantOf` at read time). Do not
reintroduce without an ADR.

## Phases

**Phase 1 (now): single editorial.** One curator or a tiny team. The admin
UI is localhost-gated. Quality bar is high; quantity is low. AI assists by
extracting/translating/linking/suggesting, but a human always approves
before publish (with narrow exceptions for high-confidence auto-applies —
see the AI policy ADR when written).

**Phase 2 (later): community curation.** Logged-in users can contribute
ingredients, pairings, and recipes; editors moderate. Auth, moderation
queue, attribution per author. Not in scope yet; do not design Phase 1
features around it. Phase 2 starts only when Phase 1 has enough seed
content that community contribution is additive, not the only path.

**Three roles** govern write access:

- **lead-curator** — localhost, Phase 1 onward. Full auto-apply per
  ADR 0004; writes via `LocalFsStore`.
- **moderator** — hosted, vetted, from Phase 2 day-1. May write any
  entity type without waved unlock. No auto-apply (auto-apply stays
  localhost-only because the threat model assumes immediate human
  proximity for revert). AI is suggestion-only; suggestions
  fast-track. Writes via `GitHubStore`.
- **contributor** — hosted, public, Phase 2. Follows a waved unlock
  by entity stakes: pairings → recipes → mixtures → ingredients.
  All writes are suggestion / draft pending moderator review.

**Phase 2 entry criterion** combines content gates and capability
gates. Content: every region has ≥3 published entries, every mixture
`kind` has ≥3 examples, every ingredient `category` has ≥5, every
mixture is in the graph (≥1 pairing or recipe), pairings ≥3× mixture
count, ≥80% of ingredients hit recommended-tier completeness.
Capability: `GitHubStore` battle-tested for ≥4 weeks of dogfooded
hosted-admin use; auth/moderation/attribution shipped; AI suggestion
suppression proven across ≥4 weeks; one full week with no schema
change. See ADR 0007.

**Persistence is an injected adapter** in both phases (`ContentStore`
interface). Phase 1 uses `LocalFsStore` (writes JSON to disk on the
lead curator's machine, ships via `git push`). Phase 2 uses
`GitHubStore` (hosted admin commits via the GitHub API, lead curator
reviews via PR). Same admin code, same content shape on disk, same
AI event log — only the store changes. The interface stays single-step
`put`; multi-step approval flows live above it (git PR review). See
ADR 0006.

## Non-goals (current phase)

- User accounts, comments, ratings, social features.
- Shopping integrations.
- Native mobile apps.
- Self-hostable distribution.
- A general recipe-discovery surface (search by ingredient/cuisine across
  the long tail of meal recipes — that's not the value prop).

## Editorial principles

- **Polish over volume.** A small set of deeply-curated entries beats a
  thousand thin ones.
- **Always-up-to-date.** AI assists with refresh and translation so content
  doesn't decay.
- **Multilingual from day one.** Each entry has a per-entry
  `canonicalLocale` set on first save — whichever locale was authored
  first wins, no global EN-first requirement. Translations declare
  `translationOf: <slug>`. Source-side changes stamp
  `translationStaleSince` on translations; editor (with AI assist)
  decides when to refresh. Phase 1 = EN + DE; further locales enter
  via the translation flow, not parallel hand-authoring. Slugs are
  English-derived by editorial convention (URL stability across the
  catalog) but not schema-enforced. Detail pages fall back to
  canonical content with a banner when the requested locale is
  missing.
- **AI suggests; the editor decides.** Auto-applied AI changes are
  conservative and reversible; everything else is suggestion-only.
- **Schema.org first.** Mixtures and recipes use schema.org Recipe
  JSON-LD as the canonical storage format. Atomic ingredients use a
  leaner non-Recipe encyclopedia shape. Site-specific data lives in
  `.meta.json` sidecars in both cases.

## Public site IA

The public site is a **growing directory**, not a marketing surface.
Its job is _navigation through inventory_.

**Homepage:** worldmap hero (an editorial roadmap surface — empty
region dots advertise "planned, content coming"), featured-pairing
block, recently-added feed across all four content types. The full
relationship graph gets its own future page, with a teaser slot on
the homepage.

**Primary navigation: two tiers.**

- _Content tier:_ `Mixtures · Ingredients · Pairings · Recipes` (in
  content-priority order). Recipes are last because they are
  secondary.
- _Lens tier:_ `Worldmap`, future `Graph`, `Search`, `Cook mode`
  toggle. These are navigation lenses on the catalog, not content
  collections.

**Index pages:** `/mixtures/` (with kind sub-indexes
`/mixtures/<kind-plural>/`), `/ingredients/`, `/pairings/`,
`/recipes/`. The pairing index opens with a "recently added" strip
above a flat browsable list filterable by region, endpoint kind,
and category.

**Search:** Pagefind, full-text, faceted across all four content
types. Facets: `kind`, `region`, `category`, `flavorProfile`,
`cuisine`. Per-locale index. Drafts excluded automatically.

**Detail pages:** linear single-column with a "Jump to recipe"
button after the summary. Mixture pages render encyclopedia-first
(history, culinary use, variant notes, sources) above the recipe
core (ingredients, steps, yield, times) above relations (pairings,
variants, featured-in, gallery) above the auto liability footer.
Ingredient pages reuse the same skeleton minus the recipe block.

**Cook mode:** localStorage-backed view preference, toggled from
the lens-tier nav and from the detail-page hero. Hides
encyclopedia, relations, sources, AI events, variant notes. Shows
compact hero + recipe core. Applies to mixture and recipe detail
only; ingredient detail always renders full encyclopedia. The
print stylesheet mirrors cook mode. Single URL, single SSR output;
crawlers see the full encyclopedia version.
