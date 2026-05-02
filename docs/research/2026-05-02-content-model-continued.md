# 2026-05-02 (continued) — Content model, multilingual, AI boundary

**Format:** `/grill-with-docs` Q&A interview, continuing the same-date
prior session that paused mid-stream.
**Status:** paused — Q5 through Q8 closed; Q9 through Q12 still open.
**Outputs this session:**

- `/CONTEXT.md` updated (Ingredient revised, Mixture added, relation
  taxonomy endpoints widened, multilingual model rewritten,
  schema.org-first principle revised).
- `docs/adr/0002-mixtures-and-ingredients.md` — collection split.
- `docs/adr/0003-per-entry-canonical-locale.md` — multilingual
  storage and canonical-locale model.
- `docs/adr/0004-ai-auto-apply-boundary.md` — auto-apply rules and
  event-log shape.

## Why this continuation

Prior session locked the project identity, glossary umbrella
("ingredient covers atomic + composed"), reusability axis, three
relations, variant model. It paused before resolving the storage
shape (Q5), the encyclopedia depth on ingredients (Q6), the
multilingual model (Q7), or the AI auto-apply boundary (Q8). This
session closed all four.

Session was conducted in auto mode after Q5b — user asked for fewer
pre-locking interruptions, lock-and-flag-on-pushback became the
default. Q5d, Q6b/c, Q8a/b/d/e were locked without per-sub-question
confirmation; the user only pushed back on the EN-canonical
assumption in Q7d (correctly — see below) and on the lean Q8c log
shape (correctly — needed rejection memory and acceptance log).

## Discussion

### Q5 — Storage shape for ingredients/mixtures

The prior session left Q5 with recommendation B″ (single
`ingredients` collection, discriminated union on `kind`). The user
**rejected B″** with a substantive argument:

> An ingredient in its final evolution will have multiple text
> blocks and images, taxonomy, medicinal uses, history. That's
> separate from a recipe ingredient. Spice mixes/blends/chutneys
> are recipes that get saved. We can't put them together — the
> schemas are genuinely different. The overlap is only at the
> reference layer (both can appear in a recipe's ingredient list).

This re-opened the glossary unification from the prior session. The
"ingredient covers atomic + composed" umbrella was reverted —
**ingredient is now atomic only**, and **mixture** becomes a
first-class peer collection.

**Options reconsidered (this session):**

- **B′** — two collections sharing schema where possible.
- **B″** — single collection, discriminated union, two file shapes.
- **C** _(new, locked)_ — two collections with **different**
  schemas, unified at the reference layer via a discriminated
  link encoding.

**Resolution: C.** Storage genuinely differs (ingredients =
encyclopedia-only; mixtures = schema.org Recipe + encyclopedia
sidecar). Forcing them into one collection produces a
discriminated union where most fields are nullable per kind —
type pressure with no payoff. Reference encoding handles the
"mixture-as-ingredient" use case cleanly.

#### Sub-decisions locked

- **Naming.** `Mixtures` (not `Compositions`, not `Components`).
  User: "since the project's name is Spicemixer, Mixtures fits;
  with the right tone of voice the chemistry-set framing can be
  funny." Tone-of-voice commitment: casual, funny, inspiring.
  Two flagged risks (the colloquial sense of "mixture" =
  transient bowl-state, and pickles/oils not feeling like
  "mixtures") accepted as editorial-voice problems, not blockers.
- **Closed `kind` enum:** `spicemix`, `sauce`, `rub`, `oil`,
  `pickle`, `chutney`, `marinade`. (User chose 7 explicitly; the
  earlier `paste` was dropped.)
- **Reference encoding A:** `{ collection: "ingredients" |
"mixtures", slug: string }`. Today's `ingredientLinkItem`
  already half-implements this — the enum just needs widening.
  Rejected B (string-namespaced `ref: "mixtures/harissa"`) and C
  (bare slug + global uniqueness) for fragility reasons.
- **Routes:** `/mixtures/<slug>/` for detail, `/mixtures/<kind-plural>/`
  for kind-filtered indexes, `/mixtures/` for full index. Plural
  kind names (`spicemixes`, `sauces`, `rubs`, `oils`, `pickles`,
  `chutneys`, `marinades`) reserved from the slug pool to avoid
  collision. 301 redirects from `/spicemixes/<slug>` and
  `/sauces/<slug>` preserve external links.
- **Admin forms.** Mixtures + Recipes share `RecipeForm` (same
  schema.org Recipe shape; meta sidecar `kind` differentiates).
  Ingredients keep `IngredientForm` (genuinely different schema).
  New-entity entry branches Ingredient / Mixture / Recipe.
- **Slug uniqueness.** Per-collection. Cross-collection
  collisions (`mint` ingredient + `mint` mixture) are surfaced
  as a soft warning in admin.

ADR: `0002-mixtures-and-ingredients.md`.

### Q6 — Encyclopedia depth on atomic ingredients

User said atomic ingredients in their final form have rich content:
text blocks, images, taxonomy. Today's schema (`name`, `summary`,
`description`, `image`, `category`, `origin`, `flavorNotes`) is
thin.

**Options considered:**

- A) Flat structured fields for everything — Zod-enumerable,
  rigid, squeezes voice.
- B) Pure block-based content (`blocks: Block[]`) — maximum
  freedom, gives up the graph (no faceted queries on medicinal
  use, family, etc.).
- C) Hybrid — structured taxonomy (queryable) + long-form markdown
  sections (free-form).

**Resolution: C.**

Locked field set:

- _Taxonomy (queryable):_ `name`, `commonNames[]`, `botanicalName?`,
  `family?`, `category` (existing enum, unchanged), `parts[]?`
  (`seed | leaf | root | bark | fruit | flower | bulb | rhizome`),
  `origin[]`, `seasonality?` (free string for v1, structurable
  later), `flavorProfile[]?` (closed enum: `warm`, `citrusy`,
  `bitter`, `pungent`, `sweet`, `earthy`, `floral`, `herbaceous`,
  `smoky`, `umami`, `sour`), `flavorNotes[]` (free strings,
  complement to enum), `safetyFlags[]?` (closed enum: allergen
  list + warning flags like `pregnancy-caution`,
  `medication-interaction`), `images[]` (existing single `image`
  becomes `images[0]` as hero).
- _Long-form sections (each optional markdown):_ `summary`,
  `description`, `culinaryUse`, `medicinalUses`, `healthBenefits`,
  `safetyNotes`, `history`, `storage`, `sourcing`. The
  medicinal/health/safety trio is split deliberately — different
  sourcing and liability profiles.
- _Sources:_ `sources[{ url, title, author?, publication?,
accessedAt? }]` per ingredient. Inline `[text](url)` markdown
  citations within sections. Schema does not require sources;
  admin shows a soft warning when any of medicinal/health/safety
  sections is non-empty and `sources` is empty.
- _Liability disclaimer:_ page-level, auto-renders when any of
  medicinal/health/safety sections is non-empty. One short line:
  "Spicemixer's encyclopedia is for cultural and culinary
  interest. Nothing here is medical advice." No per-section
  duplication.
- _Completeness tiers:_ required = `name`, `category`, `summary`;
  recommended = `description`, `botanicalName`, `family`,
  `origin`, `parts`, `culinaryUse`, `flavorProfile`, `images[0]`;
  optional = everything else.

No ADR — Q6 is a schema specification, not a hard architectural
decision. Lives in this session doc and in CONTEXT.md.

### Q7 — Multilingual model

Storage today is inconsistent: ingredients use parallel files per
locale (`ingredients/en/cardamom.json` + `ingredients/de/...`);
pairings use a single file with locale-keyed `descriptions: {
en, de }`.

**Storage shape (Q7a):**

- A) Parallel files per locale (current ingredient pattern).
- B) Single file, locale-keyed fields (current pairing pattern).
- C) Hybrid — language-neutral base + per-locale overlay.

**Resolution: A.** Astro content collections expect file-per-entry;
C breaks that pattern with insufficient payoff (the "duplicated"
language-neutral fields are short and translation as cultural
localization legitimately edits even structurally-similar fields
like `commonNames` and `origin` ordering). Pairings keep their
inline locale-keyed pattern as a documented exception (low-volume,
single-paragraph field).

**Sync model (Q7b):**

Independent edit + stale-flag.
`translationStaleSince: <iso-date>` lands on translations when
the canonical entry's content hash changes. Admin surfaces a
"needs review" list. AI does not auto-translate; it offers a
candidate when the editor opens the stale entry. Rejected
"always-synced auto-translate" as too aggressive given the
editorial principle. Rejected "fully independent, no flag" as too
lax — drift is the documented failure mode.

**Translation semantics (Q7c):**

Localize, not just reword. Different locales can use locally-
meaningful example dishes, reorder `origin` by cultural relevance,
adjust `commonNames`, cite locale-specific sources. Cannot
contradict canonical facts (botanical name, family, safety flags).
Editorial guidance, not schema-enforced.

**Locale scope (Q7d):**

Initial recommendation: "EN is canonical." User pushed back —
**rightly**:

> Users will write or ingest what they think is good content and
> not be bound to always create EN content first.

**Locked: per-entry canonical locale.** Each entry's meta sidecar
carries `canonicalLocale: <code>` set on first save — whichever
locale was authored first wins. Translations declare
`translationOf: <slug>` (slug is collection-unique already, no
locale prefix). Stale-flagging fires from whichever locale is
canonical for that entry.

Phase 1 active locales: EN + DE. Schema not locale-restricted
(`z.string().length(2)`); admin/build configs gate the active
set. Third locale (FR, IT, ES, …) is Phase 2 — needs the
translation pipeline matured first.

Slug convention: English-derived where reasonable (URL stability
across the catalog regardless of which locale was authored first).
Editorial guidance, not schema enforcement. Romanization story
for non-Latin scripts deferred.

Detail-page fallback: render canonical-locale content with a
banner ("This is the original [locale] entry; an [other-locale]
translation is pending.").

ADR: `0003-per-entry-canonical-locale.md`.

### Q8 — AI auto-apply boundary

**Q8a — Safety criteria.** Auto-apply requires _all four_:

1. **Reversible** — undo is one click, no data loss.
2. **Verifiable** — editor can tell at a glance if it's right.
3. **Bounded** — small, contained field, not a rewrite.
4. **Confidence-quantifiable** — AI emits self-reported
   confidence; threshold is `high` (or `>= 0.85` if numeric).

Failing any criterion → suggestion-only.

**Q8b — Allowlist.**

- Auto-apply: ingredient link detection, pairing slug detection,
  language detection, tag suggestions (high-confidence), image
  attribution extraction, completeness gauge (display-only).
- Suggestion-only: translation candidates, encyclopedia text
  generation (description/history/culinary), medicinal/health/
  safety content, slug renames, variant fork suggestions,
  pairing creation (new entity).

**Q8c — Event log.** Single sidecar field `aiEvents[]` captures
four event types (`auto-applied`, `accepted`, `rejected`,
`ingested`).

User asked for an expansion beyond the original lean shape:

> When a user rejects a suggestion we need to save that fact —
> annoying to get the same rejected suggestion all over again.
> Key to a self-learning system. And we need to log all accepted
> AI generated or ingested content changes. Rather keep it simple.

**Locked event shape:**

```ts
aiEvents: [{
  type: "auto-applied" | "accepted" | "rejected" | "ingested",
  field?: string,           // omitted for full-document ingest
  suggestion: {
    hash: string,           // stable hash of normalized payload
    summary: string,        // human-readable preview
  },
  at: string,               // ISO datetime
  model: string,            // e.g. "claude-opus-4-7"
  confidence?: "high" | "medium" | "low",
  source?: string,          // for "ingested": origin URL
  reason?: string,          // for "rejected": optional editor note
}]
```

- **Suggestion deduplication:** before surfacing a suggestion,
  check `aiEvents` for matching `rejected` on `(field,
suggestion.hash)`. Match → suppress. Different hash on the same
  field renders normally.
- **Self-learning hook (Phase 1: passive):** rejected suggestions
  are visible to the model in subsequent prompt context.
  Phase 2 can feed the rejection corpus into a tuning loop.
- **Volume control:** soft cap of 100 events per sidecar. Prune
  oldest `auto-applied` first, then oldest `accepted`. Never
  prune `rejected` (suppression depends on it) or `ingested`
  (provenance). Pruned events remain in git history.
- **Hash function:** stable hash (sorted keys, trimmed
  whitespace, lowercased free text); SHA-256 first 12 hex chars.

Storage stays in the sidecar. Git provides the history layer for
free. No separate event store.

**Q8d — Translation behavior on source change.** Already locked
in Q7b: stale-flag, never auto-translate. AI offers candidates
when the editor opens the stale entry.

**Q8e — Phase 2 rule change.** For community-submitted content,
**all auto-apply behaviors revert to suggestion-only**.
Auto-apply is a privilege of the localhost-gated admin workflow.
Runtime check gains: `if (origin === "community") return
suggestionOnly`.

ADR: `0004-ai-auto-apply-boundary.md`.

## Decisions locked this session

1. **Mixtures collection** replaces `spicemixes` + `sauces` and
   absorbs broader composed-ingredient kinds.
2. **Atomic ingredient** narrowed (no recipe fields); rich
   encyclopedia schema with hybrid taxonomy + sections.
3. **Reference encoding A** — discriminated `(collection, slug)`
   for all cross-entity links.
4. **Per-entry canonical locale** — first-saved locale wins.
5. **Stale-flag translation sync** — never auto-publish
   re-translations.
6. **AI auto-apply allowlist** — six categories auto-apply; rest
   are suggestion-only; community content is always
   suggestion-only.
7. **Event log in sidecar** — `aiEvents[]` captures
   auto-applied/accepted/rejected/ingested with hash-based
   deduplication.

## Implications — candidate features / changes

### Schema & data model

- New `mixtures` collection. Migrate `spicemixes/*` and
  `sauces/*` content into `mixtures/<slug>.json` with `kind` set
  appropriately. Drop `spicemixes` and `sauces` collections from
  `content.config.ts`.
- Update meta sidecar schema for mixtures: `kind` enum widens to
  the new 7-value set; rename `spicemixes`/`sauces` references.
- Expand atomic ingredient schema with the Q6 field set.
- Update `ingredientLinkItem`: widen `collection` enum to
  `["ingredients", "mixtures"]`. Update all link references in
  authored content. Rename to a more general type if appropriate
  (e.g., `entityRef`).
- Update pairing schema: endpoint type becomes the same
  discriminated reference — `(collection, slug)` over
  `ingredients` ∪ `mixtures`.
- Add `canonicalLocale` to all meta sidecar schemas
  (recipeMeta, ingredientMeta, pairingMeta-equivalent).
  Default to author's active-locale on first save.
- Add `translationStaleSince` to translation entries; populate
  from a content-hash diff watcher.
- Replace existing `aiSuggestions` / ad-hoc AI tracking with
  unified `aiEvents[]`. Migrate existing tracked actions where
  reasonable; otherwise reset on first save.

### Routing & redirects

- Add `/mixtures/`, `/mixtures/<kind-plural>/`, `/mixtures/<slug>/`
  routes.
- 301 redirects from `/spicemixes/<slug>` and `/sauces/<slug>` to
  `/mixtures/<slug>`. Preserve old route shapes for at least one
  major release.
- Reserve plural kind names from the mixture slug pool in the
  slug validator.

### Admin UI

- New-entity entry routes: branch on Ingredient / Mixture /
  Recipe. Mixture+Recipe → `RecipeForm` with `kind` dropdown;
  Ingredient → `IngredientForm` with the expanded schema.
- "Needs review" surface for `translationStaleSince` entries.
- Inline "AI applied · revert" tags on auto-applied fields.
- Suggestion suppression based on `aiEvents` rejection log.
- Soft warnings:
  - Cross-collection slug collision.
  - Medicinal/health/safety section non-empty with empty
    `sources`.

### Public site

- Liability disclaimer component, auto-rendered when any of
  medicinal/health/safety sections is non-empty.
- Detail-page fallback banner for non-canonical-locale views.
- Ingredient page template: render hybrid layout (taxonomy
  sidebar + sections in main column + image gallery).
- Mixture page template: render encyclopedia-first ("what is
  harissa?"), recipe section ("how to make it") below.
- Pairing pages: endpoints can now be ingredient or mixture;
  rendering accommodates both.

### Documentation

- Three ADRs as listed at the top of this doc.
- Update CONTEXT.md (done inline this session).
- README rewrite (Q12) still pending.

### Tooling / package work

- Stable hash utility for `aiEvents.suggestion.hash` — deterministic,
  collision-tolerant, language-independent.
- Slug validator: reject reserved plural-kind names from the
  mixture slug pool.
- Migration script: spicemixes/sauces → mixtures with `kind` set.
- Content-hash watcher: stamp `translationStaleSince` on
  source-side change.

## Open questions for next session

1. **Q9** — Public site IA. Now informed by the locked content
   model (mixtures replaces two prior collections; pairings
   span ingredient ∪ mixture; encyclopedia-first on detail
   pages). Specific decisions: homepage shape, primary nav,
   pairing index, search/faceting, recipe demotion.
2. **Q10** — Persistence beyond LocalFsStore. Hosted-vs-local
   admin, GitHub API vs headless CMS vs DB, editor onboarding,
   PR/approval flow.
3. **Q11** — Phase 1 → Phase 2 transition criterion. Seed
   coverage targets, capability gates, sequencing of community
   surfaces, monetization scope.
4. **Q12** — README rewrite. Audience, tone, content split
   across README / CONTEXT.md / docs/adr / docs/research.

## Glossary deltas this session (already in CONTEXT.md)

- **Ingredient** narrowed to atomic only.
- **Mixture** added as a peer first-class entity with closed
  `kind` enum.
- **Pairing** endpoints widened to `(collection, slug)` over
  ingredients ∪ mixtures.
- **Variant** clarified as recipe-bearing only — mixtures and
  recipes have variants; ingredients do not.
- **The graph** updated: now spans ingredients, mixtures,
  pairings, and recipes.
- **Multilingual** rewritten: per-entry canonical locale,
  parallel files, stale-flag sync.
- **Schema.org first** revised: applies to mixtures and recipes;
  ingredients use a leaner non-Recipe encyclopedia shape.

Removed: "composition" (briefly considered as a name, rejected
in favor of "Mixture" for brand fit).
