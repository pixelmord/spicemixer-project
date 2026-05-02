# Public site IA: worldmap-led growing directory

The public site frames itself as a **growing directory** — an
inventory-navigation surface, not a marketing surface. The homepage
hero is a worldmap that doubles as an editorial roadmap; nav is
two-tiered (content collections vs. navigation lenses); recipes are
demoted in editorial weight while keeping a top-level URL space.

A new closed-enum `region[]` field on ingredients, mixtures, and
recipes drives the worldmap and the search/index facet layer.

## Context

Prior decisions (ADRs 0002–0004) locked the content model
(mixtures + ingredients separation, per-entry canonical locale,
AI auto-apply boundary). They left the _public-facing IA_ open
— how the catalog is presented, how readers discover content,
how the "pairings are the headline relation, recipes are
secondary" priority manifests in nav and URL structure.

The site is SSG (Astro). No server runtime; no community
contribution surface in Phase 1. Seed content density is low and
will stay low for a while — "polish over volume" is an editorial
principle. Whatever IA we lock has to look honest at low content
density and stay legible as the catalog grows.

## Homepage thesis

**Locked: worldmap-as-hero, editorial-roadmap framing.**

The homepage demonstrates _coverage_, not value-prop pitches.
A reader landing on the homepage sees:

1. **Worldmap hero** — culinary macro-regions rendered as a dot
   grid on an abstract world canvas. Filled dots link to the
   region's ingredients/mixtures; **empty dots are first-class**
   and signal "planned, content coming." The worldmap is the
   roadmap, in public.
2. **Featured-pairing block** — one curated pairing rendered as
   its two endpoints + the editorial "why they pair" text. A
   single edge of the relationship graph, presented legibly.
3. **Recently-added feed** — chronological mix of new mixtures,
   ingredients, and pairings (no recipes — recipes are
   secondary). The "growing" signal made tangible.

The full multi-edge relationship graph gets its own future
landing page, with a teaser slot on the homepage when that page
ships.

### Alternatives rejected

- **Encyclopedia hero (featured ingredient/mixture).** Most
  conventional, lowest distinctiveness; competes with every
  cookbook blog. Treats the catalog as the destination rather
  than the network.
- **Graph hero.** Too abstract above-the-fold; multi-edge graphs
  read as noise without per-node context.
- **Editorial intro + small worldmap teaser.** Lower rendering
  risk but loses the identity statement; the worldmap is the
  identity.

## Region taxonomy

A closed-enum `region[]` field is added to ingredients,
mixtures, and recipes.

- **Multi-valued.** Cardamom belongs to South India _and_
  Guatemala; harissa to North Africa; fusion recipes to several.
- **Closed enum, ~15–25 entries**, "culinary macro-region"
  granularity (e.g. `north-africa`, `levant`, `mediterranean`,
  `south-india`, `east-asia`, `andean`). The exact list is
  deferred to a separate sub-task once seed content informs
  granularity. Schema commits to the macro-region tier.
- **Pure additions are migration-free.** Splits or merges of an
  existing region require a content migration (some entries
  re-tagged).
- **Pairings do not carry `region[]`.** A pairing's regions
  derive from the union of its endpoints' regions at read time.

### Distinct from existing fields

| Field           | Scope                          | Granularity                    | Purpose                                             |
| --------------- | ------------------------------ | ------------------------------ | --------------------------------------------------- |
| `region[]`      | ingredients, mixtures, recipes | culinary macro-region (closed) | worldmap, search facet, queryable                   |
| `origin[]`      | ingredients only               | free string, finer             | provenance prose ("Kerala", "Guatemalan highlands") |
| `recipeCuisine` | mixtures, recipes (schema.org) | free string, cuisine-level     | "Italian", "Tunisian" — not the same axis as region |

Cuisine ≠ region. Tunisian cuisine lives in the North Africa
region. Origin is finer than region. All three coexist;
documentation tells editors not to conflate them.

### Worldmap empty-dot semantics

Empty regions are **planned** and rendered. The full enum is
baked into the codebase; "planned" status falls out of "0
published entries with this region tag," "in-progress" status is
not represented (defer until needed). This is a public commitment
surface — editors should expect social pressure when planned
regions stay planned for months.

## Primary navigation

**Two tiers.**

- **Content tier** — `Mixtures · Ingredients · Pairings · Recipes`,
  in content-priority order. Recipes last because secondary.
- **Lens tier** — `Worldmap`, future `Graph`, `Search`,
  `Cook mode` toggle. Navigation lenses on the catalog, not
  content.

Mobile collapses both tiers into a hamburger; the tier
distinction (content vs. lens) is preserved as section headers
inside the menu.

### Alternatives rejected

- **Flat nav** (one row, lenses peer to content) muddles the
  model: `Worldmap` is not a sibling of `Mixtures` in any
  meaningful sense.
- **Lens-led nav** (Worldmap and Pairings first) inverts content
  priority for the sake of distinctiveness; sacrifices clarity.

## Pairing index page

A `/pairings/` route exists with shape **flat list + small
header strip**.

- **Header strip:** "recently added pairings" (3–6 cards),
  horizontal scroller. Ties to the "growing directory" framing.
  A "most-paired ingredients" leaderboard variant is deferred
  until content density makes it interesting.
- **Body:** flat browsable list — each row is `endpoint A ×
endpoint B — short description`. Filters: `region`, endpoint
  kind (ingredient×ingredient, ingredient×mixture,
  mixture×mixture), category.

## Search

**Pagefind**, full-text, faceted across all four content types.
Per-locale index built at SSG time.

- **Facets:** `kind`, `region`, `category`, `flavorProfile`,
  `cuisine`.
- **Drafts excluded** automatically (drafts aren't rendered, so
  Pagefind doesn't index them).
- **No infra.** Pure client-side at runtime; ~50KB index chunk.
- **UI:** results page reachable from a search input in the
  lens-tier nav. Header instant-search dropdown is a polish
  item, not v1.

### Alternatives rejected

- **Custom JSON name index.** Too narrow; readers search by
  flavor and cuisine, not just names.
- **Hosted search (Algolia, Typesense Cloud).** Overkill at
  current scale; adds infra dependency for marginal UX gain.

## Recipe demotion

Recipes keep their top-level `/recipes/<slug>/` URL space. The
"secondary" signal lives in editorial surfaces, not URL shape.

- **Not on homepage hero, worldmap dots, or pairing index
  spotlights.**
- **Last position in content-tier nav.**
- **Cross-linked from mixtures and ingredients** ("recipes that
  use this") — primary discovery path is mixture/ingredient →
  recipe, not standalone browse.

### Alternatives rejected

- **`/mixtures/<slug>/recipes/<slug>/` nested under primary
  parent.** Forces every recipe to have a single primary parent,
  which is artificial: a real recipe demonstrates multiple
  ingredients and mixtures simultaneously.
- **Recipes as orphans (no own URL).** Hurts shareability and
  SEO; recipes are still real content with their own page worth
  visiting.

## Detail-page rendering

**Linear single-column** with a "Jump to recipe" button after
the summary.

### Mixture detail order

1. **Hero** — name, hero image, kind badge, `region[]` pills,
   summary (1–2 lines), "Jump to recipe" button.
2. **Encyclopedia** — `description`, `history`, `culinaryUse`,
   variant notes, `storage` (optional), `sources` (always last
   in this block).
3. **Recipe** (anchor target `#recipe`) — ingredients, steps,
   yield, times. schema.org Recipe JSON-LD emitted here.
4. **Relations footer** — pairings, variants of this, featured-in
   (recipes that use it), images gallery.
5. **Liability footer** — auto-renders if any of
   `medicinalUses` / `healthBenefits` / `safetyNotes` is non-empty.

### Ingredient detail

Same skeleton minus the recipe block. Hero → encyclopedia
sections → relations footer (pairings + "used in mixtures" +
"appears in recipes") → liability footer.

### Alternatives rejected

- **Two-column with sticky recipe sidebar.** Doubles layout
  complexity for a marginal UX win; the "Jump to recipe" button
  delivers ~90% of the benefit at ~10% of the cost.
- **Tabbed (About / Recipe / Variants / Pairings).** Shatters
  encyclopedia/recipe coexistence; hurts the encyclopedia-first
  framing because the recipe is one click away rather than below
  the fold. Hurts Pagefind hit context too.

## Cook mode

A localStorage-backed view preference for distraction-free
recipe consumption.

- **Toggle** in lens-tier nav (peer of Search) and as a "Switch
  to cook mode" button in the detail-page hero.
- **Mechanism:** CSS-only — `[data-mode="cook"]` selector on
  `<html>`, set by an inline pre-render script reading
  localStorage before paint (no FOUC).
- **Cook mode renders:** compact hero, recipe ingredients,
  recipe steps, yield/times.
- **Cook mode hides:** encyclopedia sections, relations footer,
  sources, AI events display, variant notes.
- **Scope:** mixture detail and recipe detail only. Ingredient
  detail always renders full encyclopedia (an ingredient lookup
  mid-cook is by definition encyclopedic intent). Indexes,
  worldmap, and pairing pages are unaffected.
- **Print stylesheet:** `@media print` mirrors cook mode —
  printing a recipe gives the cook view automatically.
- **SEO:** single URL, single SSR output, full encyclopedia
  rendered in HTML; cook mode is JS-mediated only. Crawlers see
  the encyclopedia.

## Consequences

### Schema and data

- New `region` enum (closed, ~15–25 macro-regions; exact list
  deferred). Add `region[]` to ingredient, mixture, and recipe
  meta schemas. No field on pairings.
- Document `region` vs. `origin` vs. `recipeCuisine` separation
  in the editor onboarding so the three axes don't get
  conflated.

### Routes and rendering

- Homepage rebuilt around worldmap hero + featured-pairing +
  recently-added feed.
- New `/pairings/` index page (flat list + recently-added strip,
  with region/kind/category filters).
- Two-tier nav component (content tier + lens tier) on the base
  layout, with the mobile collapse pattern.
- Mixture detail page template restructured to the linear order
  above; "Jump to recipe" anchor added.
- Cook mode CSS layer + localStorage toggle script + print
  stylesheet mirror.

### Search

- Pagefind integration (build step, per-locale indexes,
  `data-pagefind-filter` attrs on `kind`, `region`, `category`,
  `flavorProfile`, `cuisine`).
- Search results page in lens-tier nav.

### Worldmap

- A worldmap component (SVG dot grid over an abstract world
  canvas) reading from the region enum and aggregating
  `region[]` over published ingredients/mixtures/recipes.
- Empty-dot rendering treats absence of content as "planned."

### Editorial discipline

- Worldmap empty dots are a public commitment surface. Editor
  expectations: a region tagged as "planned" should not stay
  empty indefinitely without re-evaluation.
- Recipes excluded from homepage and pairing surfaces — a
  re-check in code review (no recipe collection imports in
  homepage components).

## Open follow-ups

- The region enum's exact list (deferred to a separate
  sub-task; needs a seed-content pass to inform granularity).
- The dedicated graph landing page (deferred until worldmap
  ships and content density justifies a graph view).
- The "most-paired ingredients" leaderboard variant of the
  pairing-index header strip (deferred until pairing density
  makes it interesting).
- The instant-search dropdown in the header (polish; not v1).
- The cook-mode ingredient checklist interaction (polish; not
  v1).
