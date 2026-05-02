# Open questions

Live Q&A queue for the foundation research. Top of file = highest
priority. Closed questions live at the bottom with a resolution date
and a link to the session doc.

When a question is closed:

1. Move it to the **Closed** section with date and session ref.
2. If the answer is hard-to-reverse and surprising, write an ADR.
3. If the answer implies build work, append to the relevant session
   doc's "Implications" list.

---

_(no open questions at this time — Q5–Q12 closed across the
2026-05-02 sessions)_

---

## Closed

### Q12 — README rewrite — closed 2026-05-02 (session 3)

**Resolution: open-source-readers framing.** README is the front
door, written for an OSS-curious developer who landed on the
repo. Owns thesis, role model, dev workflow, and pointers; does
not duplicate CONTEXT.md, ADRs, or research.

- Tone matches public-site voice (casual, dry-witty, "growing
  atlas of culinary spice. Mostly the chemistry kind.").
- README delegates: `CONTEXT.md` for glossary + thesis,
  `docs/adr/` for decision history, `docs/research/` for
  brainstorming trail, `docs/agents/` for agent tooling.
- Phase 1 editor onboarding (clone, `vp install`, `vp dev`,
  navigate to `/admin/`) is documented as technical-only;
  non-developer onboarding is a Phase 2 concern.
- Decision index lists ADRs 0001–0007 with one-line summaries.

No ADR — README content is editorial copy, not an architectural
decision. **Session doc:**
`docs/research/2026-05-02-public-ia-and-phase-2.md`.

### Q11 — Phase 1 → Phase 2 transition — closed 2026-05-02 (session 3)

**Resolution: B+C hybrid criterion + three-role model + zero
monetization through Phase 2.**

- **Content gates:** every region has ≥3 published entries; every
  mixture `kind` has ≥3; every ingredient `category` has ≥5;
  every mixture is in the graph (≥1 pairing or recipe); pairings
  ≥3× mixture count; ≥80% of ingredients hit recommended-tier
  completeness.
- **Capability gates:** GitHubStore battle-tested ≥4 weeks of
  hosted-admin dogfooding; auth/moderation/attribution shipped
  and tested; AI suggestion suppression proven across ≥4 weeks;
  ≥1 week with no schema change.
- **Roles:**
  - **lead-curator** — localhost, full auto-apply, LocalFsStore.
  - **moderator** — hosted, vetted, all entity types from Phase 2
    day-1, no auto-apply (auto-apply stays localhost-only because
    ADR 0004's threat model assumes immediate human proximity for
    revert), GitHubStore writes.
  - **contributor** — hosted, public, waved unlock by stakes
    (pairings → recipes → mixtures → ingredients), each wave
    requires ≥4 weeks of stable moderation outcomes from the
    prior. All writes suggestion / draft.
- **Monetization:** zero through Phase 2. Phase 3 considers only
  editorially-aligned channels (affiliate to merchants the editor
  would link anyway, museum-style sponsorship credits, supporter
  tier with no content gate) — never display ads, never gates.

**ADR:** `docs/adr/0007-phase-transition-and-roles.md`.
**Session doc:** `docs/research/2026-05-02-public-ia-and-phase-2.md`.

### Q10 — Persistence beyond LocalFsStore — closed 2026-05-02 (session 3)

**Resolution: Phase 1 = LocalFsStore (local-only); Phase 2 =
GitHubStore (hosted admin). Both via the injected `ContentStore`
adapter — that adapter pattern is the load-bearing invariant
across the phase transition.**

- Phase 1 admin runs local-only on the lead curator's machine.
  Edits land on disk; ships via `git push`. CONTEXT.md and
  ADR 0004's "auto-apply requires localhost trust" are honored.
- Phase 2 hosted admin uses GitHubStore: contributor commits to
  per-contributor branch; lead curator reviews via standard
  GitHub PR; moderators commit directly. Content stays in git —
  no headless CMS, no DB.
- ContentStore interface stays single-step `put`. Multi-step
  approval flows (stage / review / approve) live above the
  interface — git PR review is the approval flow.
- GitHubStore stub kept with a clear "Phase 2" marker
  (`apps/website/src/lib/stores/github.ts`).
- Editor onboarding for Phase 1: clone, `vp install`, `vp dev`,
  navigate to `/admin/`. Documented in README. Acknowledged
  technical-only.

**ADR:** `docs/adr/0006-persistence-adapter.md`.
**Session doc:** `docs/research/2026-05-02-public-ia-and-phase-2.md`.

### Q9 — Public site IA — closed 2026-05-02 (session 3)

**Resolution: worldmap-led growing-directory IA + region taxonomy +
two-tier nav + Pagefind search + linear detail pages with cook
mode.**

- **Homepage:** worldmap hero (editorial roadmap — empty region
  dots advertise "planned, content coming"), featured-pairing
  block, recently-added feed. Standalone graph deferred to its
  own future page with a homepage teaser.
- **Region taxonomy:** new closed-enum `region[]` field on
  ingredients, mixtures, and recipes (NOT pairings — derived from
  endpoints). ~15–25 culinary macro-regions; exact list deferred
  to a separate sub-task. Distinct from `origin[]` (free, finer)
  and `recipeCuisine` (cuisine, not region).
- **Primary nav (two tiers):** content tier
  `Mixtures · Ingredients · Pairings · Recipes`; lens tier
  `Worldmap · Search · Cook mode` (future `Graph`).
- **Pairing index page:** flat list with a "recently added"
  header strip. Filters: region, endpoint kind, category.
- **Search:** Pagefind, full-text, faceted across all four
  content types. Per-locale index. Facets: kind, region,
  category, flavorProfile, cuisine.
- **Recipe demotion:** recipes keep `/recipes/<slug>/`. Demotion
  lives in editorial surfaces (excluded from homepage hero,
  worldmap, pairing index; last in nav; cross-linked from
  primary content).
- **Detail page:** linear single-column with "Jump to recipe"
  button. Mixture order: hero → encyclopedia → recipe →
  relations → liability footer. Ingredient page same skeleton
  minus recipe.
- **Cook mode:** localStorage-backed view preference
  (`[data-mode="cook"]` on `<html>`, set pre-paint). Hides
  encyclopedia/relations/sources; shows compact hero + recipe
  core. Mixture and recipe detail only; ingredient detail always
  full encyclopedia. Print stylesheet mirrors cook mode.

**ADR:** `docs/adr/0005-public-site-ia.md`.
**Session doc:** `docs/research/2026-05-02-public-ia-and-phase-2.md`.

### Q5 — Ingredients collection collapse — closed 2026-05-02 (continued session)

**Resolution: model C** — neither B′ nor B″. Separate collections
with separate schemas; unification at the reference layer only.

- New collection **`mixtures`** — replaces `spicemixes` + `sauces`,
  absorbs the broader recipe-bearing composed-ingredient kinds.
  Stored as schema.org Recipe JSON-LD + meta sidecar. Closed
  `kind` enum: `spicemix`, `sauce`, `rub`, `oil`, `pickle`,
  `chutney`, `marinade`.
- **`ingredients`** narrows to atomic only. Encyclopedia schema,
  no Recipe fields. Closed `category` enum unchanged.
- **Reference encoding A** — `{ collection: "ingredients" |
"mixtures", slug: "..." }`. Used by `recipeIngredient`,
  `ingredientLinks`, `pairings` endpoints.
- **Routes:** `/mixtures/<slug>/` detail, `/mixtures/<kind-plural>/`
  kind index, `/mixtures/` full index. Plural kind names reserved
  from slug pool. 301 redirects from `/spicemixes/`, `/sauces/`.
- **Admin forms:** Mixtures + Recipes share `RecipeForm`;
  Ingredients keep `IngredientForm`. New-entity entry branches on
  Ingredient/Mixture/Recipe.
- **Slug uniqueness:** per-collection. Cross-collection collisions
  are surfaced as a soft warning in admin.
- **Naming rationale:** "Mixtures" leans into the Spicemixer brand
  identity; chemistry-set framing is intentional. "Ingredient"
  reverts to atomic-only.

**Implies an ADR** covering storage shape, reference encoding, and
the kind enum.

### Q6 — Encyclopedia depth on atomic ingredients — closed 2026-05-02 (continued)

**Resolution: hybrid (model C)** — structured taxonomy + long-form
markdown sections.

- _Taxonomy fields:_ `name`, `commonNames[]`, `botanicalName?`,
  `family?`, `category` (existing enum), `parts[]?` (seed/leaf/
  root/bark/fruit/flower/bulb/rhizome), `origin[]`, `seasonality?`,
  `flavorProfile[]?` (closed enum: warm, citrusy, bitter, pungent,
  sweet, earthy, floral, herbaceous, smoky, umami, sour),
  `flavorNotes[]`, `safetyFlags[]?` (allergens + warnings),
  `images[]` (existing single `image` becomes `images[0]`).
- _Sections (each optional markdown):_ `summary`, `description`,
  `culinaryUse`, `medicinalUses`, `healthBenefits`, `safetyNotes`,
  `history`, `storage`, `sourcing`. The medicinal/health/safety
  trio is split deliberately — different sourcing and liability
  profiles.
- _Sourcing:_ hand-authored default; AI assists by extracting
  candidate facts; nothing medicinal/health auto-applies.
- _Citations:_ `sources[]` array per ingredient; inline
  `[text](url)` markdown links. Soft-warning in admin if
  medicinalUses/healthBenefits/safetyNotes is non-empty and
  `sources` is empty.
- _Liability disclaimer:_ page-level, auto-renders when any of
  medicinalUses/healthBenefits/safetyNotes is non-empty. Single
  short line. No per-section duplication.
- _Completeness tiers:_ required = name, category, summary;
  recommended = description, botanicalName, family, origin, parts,
  culinaryUse, flavorProfile, images[0]; optional = everything
  else.

### Q7 — Multilingual model — closed 2026-05-02 (continued)

**Resolution:**

- _Storage:_ parallel files per locale (current ingredient
  pattern). Pairings keep their inline locale-keyed descriptions
  as a documented exception (low-volume single-paragraph field).
- _Sync:_ independent edit + stale-flag.
  `translationStaleSince: <iso-date>` lands on translations when
  the canonical entry's content hash changes. Admin surfaces a
  "needs review" list. Nothing auto-publishes.
- _Semantics:_ localize, not just reword — locale-specific
  example dishes, ordering, common names, sources are allowed,
  but cannot contradict canonical facts (botanical name, family,
  safety flags).
- _Locale scope:_ Phase 1 = EN + DE. Schema not locale-restricted
  (`z.string().length(2)`); admin/build configs gate active set.
- _Canonical locale:_ **per-entry**, not global. Each entry's
  meta sidecar carries `canonicalLocale: <code>` set on first
  save — whichever locale was authored first wins. Removes EN-
  first authoring friction.
- _Slug convention:_ English-derived where reasonable, editorial
  guidance not schema enforcement. URL stability across the
  catalog regardless of canonical-locale choice.
- _Fallback:_ detail page in non-canonical locale renders
  canonical content with a banner ("This is the original
  [locale] entry; an [other-locale] translation is pending.").
- _Third locale:_ Phase 2. Needs the translation pipeline
  matured first.

**ADR:** `docs/adr/0003-per-entry-canonical-locale.md`.
**Session doc:** `docs/research/2026-05-02-content-model-continued.md`.

### Q8 — AI auto-apply boundary — closed 2026-05-02 (continued)

**Resolution:**

- _Safety criteria for auto-apply:_ reversible, verifiable,
  bounded, confidence-quantifiable. All four required;
  threshold is `high` (or `>= 0.85` numeric).
- _Allowlist (Phase 1):_ ingredient link detection, pairing slug
  detection, language detection, tag suggestions (high-conf),
  image attribution extraction. Display-only: completeness
  gauge.
- _Suggestion-only:_ translation candidates, encyclopedia text
  generation, medicinal/health/safety content, slug renames,
  variant fork suggestions, pairing creation.
- _Phase 2 rule:_ community-submitted content is always
  suggestion-only. `if (origin === "community") return
suggestionOnly;`.
- _Event log:_ single `aiEvents[]` field on each meta sidecar,
  capturing four event types — `auto-applied`, `accepted`,
  `rejected`, `ingested`. Each event carries `field?`,
  `suggestion: { hash, summary }`, `at`, `model`,
  `confidence?`, `source?`, `reason?`.
- _Suggestion deduplication:_ match new suggestions against
  past `rejected` events on `(field, suggestion.hash)`; suppress
  on hit.
- _Self-learning hook:_ rejected suggestions surface in prompt
  context (Phase 1 passive); Phase 2 may feed a tuning loop.
- _Volume control:_ soft cap 100 events per sidecar; prune
  oldest auto-applied first, then accepted; never prune
  rejected (suppression depends) or ingested (provenance).
  Pruned events remain in git history.
- _Hash function:_ SHA-256 first 12 hex chars over normalized
  payload (sorted keys, trimmed whitespace, lowercased free
  text).

**ADR:** `docs/adr/0004-ai-auto-apply-boundary.md`.
**Session doc:** `docs/research/2026-05-02-content-model-continued.md`.

### Q5/Q6/Q7 ADRs

**ADR for Q5:** `docs/adr/0002-mixtures-and-ingredients.md`.
**ADR for Q6:** none — schema specification, captured in CONTEXT.md
and the session doc rather than as a hard architectural decision.

(Q1–Q4 + Q4.5 closed in the 2026-05-02 session.)
