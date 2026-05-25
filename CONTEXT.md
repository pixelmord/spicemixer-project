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

A symmetric affinity relation between two endpoints, each a
`(collection, slug)` reference over `ingredients`, `mixtures`, or
`recipes`. Has its own description explaining the affinity ("warm and
licorice-y, both lift custard desserts"). Authored once on a canonical id
(`slug-a--slug-b`, alphabetically sorted by slug). Surfaced on both
endpoints' pages.

Pairings are the **universal editorial relation** (see ADR 0016): any
relation between two content entities that warrants prose lives as a
Pairing entity, regardless of endpoint kinds. The previous separate
`goesWellWith` field on recipe meta is collapsed into Pairing.

**Featured vs unfeatured.** A `featured: boolean` field on pairing meta
controls index inclusion. `/pairings/` shows pairings where
`featured === true` only. Defaults: ingredient/mixture-only pairings
default to `featured: true` (the editorial flagship — "the spice graph");
recipe-bearing pairings default to `featured: false` (they surface only
on the endpoint detail pages, not in the global index). Editors flip
the flag explicitly.

Cross-collection slug uniqueness is invariant (`vp check` validator) so
the flat `<slug-a>--<slug-b>` id remains unambiguous across endpoint
kinds.

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
in spicy / sweet / British-pickle styles. Harissa comes in Moroccan,
Tunisian, Lebanese. Chocolate cake comes in French, American,
grandma's. Each is a legitimate recipe; none is "the canonical one."

Modeled as a **symmetric equivalence group**, not a parent-child fork.
Each member carries `variants: string[]` listing every other member of
the group. The relation is co-equal: no canonical parent exists, because
in culinary reality none does. See ADR 0016.

**Closure on save.** Adding a member to the group writes the union of
the closure (every entity reachable via existing `variants` edges) to
every member's meta. Two clusters linking via any pair merge into one
big group. Unlinking is all-or-nothing — you can't half-belong.

**Authoring locale.** `variants` lives only on the **canonical-locale**
meta sidecar of each member. Translations carry no `variants` field —
they derive their member list by following `translationOf` back to the
canonical entity at read time. Per-locale duplication is eliminated and
drift becomes structurally impossible.

**Mixed-canonical case.** When members have different canonical locales
(e.g., harissa-moroccan canonical=EN, harissa-lebanese canonical=DE), the
closure fans out across canonical-locale folders. Each member's
`variants` list lives wherever its own canonical-locale meta lives.

Constraints:

- Allowed only on recipe-bearing entities — **mixtures** and **recipes**.
  Disallowed on ingredients (atomic — different cardamom varieties are
  separate records, not variants).
- Same-kind only — sauce↔sauce, spicemix↔spicemix, recipe↔recipe. No
  cross-kind variant pointers.

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

## Code-side abstractions

The terms above describe content. The terms below describe shared code
seams that those content concepts flow through. They live here (rather
than in an ADR alone) because conversation references them constantly:
"the EntityKind seam," "ask the AiEventLog."

### EntityKind

A code-side discriminator over `"ingredient" | "recipe" | "pairing"`
that unifies the workflow concerns shared by these three peer concepts:
draft state, AI suggestions, audit log, completeness scoring,
translations. See ADR 0008.

Critically, **`"recipe"` covers both recipe-for-a-mixture and
recipe-for-a-dish** — the on-disk split between the `recipes/` and
`mixtures/` collections is a routing concern (where on disk, which URL
prefix), not a separate EntityKind. Both collections share the
schema.org Recipe storage shape (ADR 0001) and route to
EntityKind = `recipe`.

Behind the seam, per kind: schema, AI proposer functions, diff function,
completeness ruleset.

Above the seam, shared by all kinds: form state hook, AI orchestration
runner, auto-apply policy (global, per ADR 0004).

Forms stay visually distinct — the JSX is genuinely different per kind
— but become thin bindings over a headless contract.

### AI contract

The per-entity-kind bundle the AI package consumes to fill or refine a
content type. Two parts: a Zod schema (validates the entity shape) and a
**field config** map indexed by field path. Each field config carries the
system prompt for that field, the auto-apply policy (per ADR 0004), the set
of presets it opts into (`presetIds`), and an optional `writePolicy`
declaring how proposed values reconcile with existing data.

The schema stays a pure validator — non-AI callers (forms, ingest, public
site) don't carry prompt strings in their bundle. The field config is the
companion that turns a schema into something the AI runner can drive. New
entity kinds register one contract; the runner, event log, and trace are
kind-agnostic.

### FieldWritePolicy

How a field's proposed value reconciles with existing data, when fill is
called with `currentData` or refine targets a populated field. Five modes:
`preserve` (skip the LLM call entirely), `replace` (always overwrite),
`fill-if-empty` (skip if a value exists), `merge-function` (the runner
calls the LLM and post-processes via a typed merge function — for arrays,
ids, structural unions), and `merge-instructions` (the runner injects a
free-text prompt instruction so the LLM produces a merged value directly —
for prose where merging is itself a language task).

Resolution at runtime is layered: per-call per-field override
(`runFill.fieldPolicies[field]`) → per-call default (`runFill.writePolicy`)
→ contract default (`contract.fields[field].writePolicy`) → mode default
(`fill-if-empty` for fill+currentData, `replace` for refine, no-op for
cold-fill). Editors can override at fill time via the UI's policy picker.

### Preset

A user-facing AI intent within refine — expand, change tone, do research,
add items, translate-to-de, etc. Declared at the AI contract level
(shared across fields), opted into per field via `presetIds`. Each preset
carries a label (UI button text), an instruction (prompt fragment), an
`appliesTo` field-type filter, and an optional `autoApplyOverride` (e.g.
`translate-*` overrides to `"never"` per ADR 0004's translation-is-
suggestion-only rule). Replaces the originally-proposed `mode` enum on
the refine runner — there is no top-level mode, only preset id + optional
free-text amendment.

### AiEventLog

The module that owns the read-modify-write cycle for the per-entity AI
event log mandated by ADR 0004. Reads events from the meta sidecar via
ContentStore, applies suppression and dedup rules, exposes a fingerprint
cache answering "have we seen this exact AI input before," and writes
the appended log back. Replaces today's scattered fetch-modify-write
pattern in action handlers.

`@pixelmord/content-ai-core` (filterSuggestions, hashSuggestion, etc.)
provides the utility functions behind this module's interface — the
implementation lives in `@pixelmord/content-ai-core/events.ts` (a
utility-bag of free functions over arrays).

`AiEventLog` is **editorial** — small, gitable, lives next to content,
captures _decisions_ (auto-applied/accepted/rejected/ingested). It is
distinct from **AI Trace** (below), which is ops-grade and captures
_calls_.

### AI Trace

Per-call observability log for every AI capability invocation. Captures
prompt, response, model, finish reason, token usage, timing, error, and
the `Origin` envelope (see below). Local JSONL at `.ai-trace/YYYY-MM-DD.jsonl`,
gitignored, durable but ephemeral; Sentry receives the same events as
OTel `gen_ai.*` spans for dashboards and alerts — scalar attributes only,
**no message bodies** (copyright/PII boundary). Bridges to the editorial
log via `aiEvents.traceId` so an editor reviewing an entity can pull up
the underlying call. Wired via AI SDK middleware (`wrapLanguageModel`)
so coverage is by construction — no per-capability instrumentation.

See ADR 0011.

### Origin

Code-side context envelope for an AI call: `surface`, `action`,
`entityRef?`, `field?`, `userInitiated`, `runId`, `triggeredBy`,
`sourceUrl?`, `sourceHash?`. Carried via `AsyncLocalStorage` from the
Astro action handler down to the tracing middleware — capabilities don't
thread it through their signatures. `runId` is mandatory and groups N
AI calls in one editorial operation (e.g. `aiRefreshSuggestions` fans
out to multiple proposers under one `runId`).

### Source store

Hash-keyed, content-addressable directory at `data/sources/<binary-sha256>/`
holding every uploaded source plus its derivative pipeline artifacts.
Decoupled from the Astro content collection — sources are large, often
copyrighted, and editorial provenance, not site content. Gitignored,
local Phase 1, S3-portable Phase 2 (hash-prefix maps cleanly to object-
storage keys).

The meta sidecar's `aiEvents.ingested.source` carries the `binaryHash`
pointer; the actual binary lives in the source store, not in git.

See ADR 0012.

### Three-stage ingest pipeline

The path from upload to structured content. Each stage is a swappable
strategy; each artifact is preserved so evals can hold one stage fixed
and sweep the others:

- **Binary stage** — original upload, no transform. `source.<ext>`.
- **Text stage** — strategy-named, version-suffixed extraction:
  `text/pdfjs-5.txt`, `text/ai-vision-claude-haiku.txt`. Multiple
  strategies coexist for the same binary. Production today: pdfjs first,
  fallback to vision-AI on sparse text (`extractPdfContent`).
- **Structured stage** — `aiExtract*` capability output keyed by
  `traceId`: `structured/<traceId>.json`. Many extraction attempts per
  source preserved.

Each artifact carries a per-file meta sidecar (`*.meta.json`) describing
its producer (strategy/version/model/parentHash). No central index.

### Locale storage

All locale-bearing collections (ingredients, recipes, mixtures,
pairings) store content **and** meta as folder-per-locale:
`<collection>/<locale>/<slug>.json` and
`<collection>/<locale>/<slug>.meta.json`. The folder is the locale
carrier; no `language` field on the file, no filename-suffix variant.
Pairings previously held inline `descriptions: { en, de }` per ADR
0003; that exception is superseded — each locale is now a separate
record so pairings get per-locale editorial history, per-locale
aiEvents, and per-locale taxonomy divergence (tags, regions) on the
same terms as every other entity.

A second, equally load-bearing invariant: **no entry is ever written
to disk without a determined locale.** Locale comes from an explicit
user pick on the form OR from the AI language-detection auto-apply
(ADR 0004 allowlist) — never from a silent default. Updates inherit
locale from the existing entry; locale changes are a translation
operation, not an edit. See ADR 0009.

### Meta sidecar

Per-entity `.meta.json` file colocated with the content file
(`<collection>/<locale>/<slug>.meta.json`, pairings flat). Holds
**editorial workflow state**: AI event log, draft flag, canonical
locale, translation provenance (`translationOf`,
`translationStaleSince`, `canonicalContentHash`), completeness
derivations. Distinct from the content file, which holds anything
the public site renders or queries — encyclopedia prose, taxonomy,
`region`, image attribution credits.

The split is by audience: meta mutates via the editorial loop and
is invisible to the public site; content mutates via editorial work
and renders to readers. ADR 0001 originally framed the sidecar as
schema.org-Recipe displacement (recipes / mixtures can't carry
custom fields); ADR 0013 generalises it to "workflow state, not
site-specific data," applied uniformly across ingredient, pairing,
recipe, mixture.

## Relation taxonomy

Two relation shapes exist (plus one structural pointer in the recipe
body). Everything else is computed. See ADR 0016.

| Relation                     | Shape                              | Endpoints                                              | Authored on                                                                    | Carries prose?         |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------- |
| **pairing**                  | symmetric, entity in `pairings`    | `(collection, slug)` over ingredients+mixtures+recipes | the `pairings` collection (own entity, per-locale `description`)               | yes                    |
| **variants**                 | symmetric equivalence group        | recipe-bearing → recipe-bearing, same kind             | `variants: string[]` on canonical-locale meta; closure-on-save                 | no                     |
| **uses** (`ingredientLinks`) | directional, structural recipe ref | recipe-bearing → ingredients+mixtures                  | meta sidecar of the user side; inverse "used in" computed at the linked entity | no (pattern→slug only) |

The previous schema had `goesWellWith`, `usesBase`, `featuredIn`,
`variantOf` (single-parent fork), and an inline `ingredient.pairings`
field. All collapsed:

- `goesWellWith` → became Pairing entities (rationale becomes the
  Pairing's `description`).
- `usesBase` → inverse of `ingredientLinks`, computed at read time.
- `featuredIn` → inverse of `ingredientLinks`, same.
- `variantOf` (single parent) → replaced by symmetric `variants: string[]`
  equivalence group.
- `ingredient.pairings` (inline) → covered by the Pairing collection.

Do not reintroduce any of these without an ADR.

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
  leaner non-Recipe encyclopedia shape. **Editorial workflow state**
  (AI event log, draft flag, translation provenance) lives in
  `.meta.json` sidecars across all kinds; **content fields**
  (taxonomy, queryable region, rendered attribution captions) stay
  on the entity. See ADR 0013.

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
