# 2026-05-02 (session 3) — Public IA, persistence, phase transition, README

**Format:** `/grill-with-docs` Q&A interview, third sitting on
2026-05-02. Continuation from
`2026-05-02-content-model-continued.md`, which closed Q5–Q8 and
left Q9–Q12 open.

**Status:** complete — Q9 through Q12 all closed.

**Outputs this session:**

- `/CONTEXT.md` updated (added `region` glossary entry; added
  Public site IA section; expanded Phases section with the
  three-role model and persistence-as-adapter principle).
- `/README.md` rewritten (replaced Vite+ scaffold default with
  project front door per ADR 0007 / Q12 framing).
- `/docs/adr/0005-public-site-ia.md` — homepage thesis, region
  taxonomy, two-tier nav, search, recipe demotion, detail-page
  rendering, cook mode.
- `/docs/adr/0006-persistence-adapter.md` — `ContentStore`
  adapter, Phase 1 `LocalFsStore`, Phase 2 `GitHubStore`, no
  multi-step write in the interface.
- `/docs/adr/0007-phase-transition-and-roles.md` — content +
  capability gates for Phase 2 entry, three-role model
  (lead-curator / moderator / contributor), waved contributor
  unlock, zero-monetization-through-Phase-2 stance.
- `/apps/website/src/lib/stores/github.ts` — stub doc updated
  to reference ADR 0006 and clarify Phase 2 timing.

## Why this session

Session 2 (`2026-05-02-content-model-continued.md`) locked the
content model and AI policy but left four large questions open:
the public-facing IA, the persistence story for Phase 1 vs.
Phase 2, the criterion for moving between phases, and the README
rewrite. None of these were resolvable without the prior
sessions' content-model decisions in place; with those locked, the
remaining four became unblockable.

This session ran in auto mode (per user preference established in
session 2) — lock-and-flag-on-pushback by default. User pushed
back twice in productive ways: (i) on hero/section count for the
homepage (asking for multi-section design rather than a single
hero), and (ii) on the Phase 2 unlock model (introducing the
moderator role tier, which the recommendation hadn't yet
proposed).

## Discussion

### Q9 — Public site IA

The current homepage is a flat feed of mixtures (spicemixes +
sauces) with no encyclopedia entry, no graph entry, no region
surface. That contradicts the locked content priorities
("mixtures > ingredients+pairings > recipes") and the locked
value-prop ("the spice graph"). Q9 reshaped the homepage and the
nav around the content model.

**Q9.1 — Homepage thesis.** Three options: pairings-led, encyclopedia-led,
mixture-led. User rejected single-thesis framing — wanted multiple
sections in the priority order Mixtures > Ingredients/Pairings >
Recipes, with three feature dimensions (relationship graph,
abstract worldmap, content feature block). Importantly, user
re-framed away from marketing: _"we aim for a growing directory
of things and do not care much about marketing and flashy
content."_ That framing shaped the rest of Q9.

**Q9.2 — Worldmap empty-dot semantics.** Three options:
(a) editorial roadmap, (b) cosmetic only, (c) Phase 2 affordance.
**Locked: (a).** The "growing directory" frame already commits to
public progress visibility. Empty dots advertise "planned, content
coming." Cost: public commitment surface — editorial pressure when
planned regions stay empty for months. Acceptable per the
editorial principles.

**Q9.3 — Region taxonomy.** Three options:
(A) derive from `origin[]`, (B) explicit `regions` collection,
(C) closed enum + free strings. **Locked: C** with four sub-locks:

- `region[]` (multi-valued; cardamom = South India + Guatemala).
- Pairings derive region from endpoints — no field on pairings.
- Region distinct from `origin[]` (finer, free-string prose) and
  `recipeCuisine` (cuisine, schema.org axis).
- Macro-region granularity committed; exact ~15–25 enum entries
  deferred to a sub-task once seed content informs.

**Q9.4 — Hero and section count.** Four options: (A) worldmap
hero, (B) graph hero, (C) feature-block hero, (D) intro + small
worldmap teaser. **Locked: A**, with featured-pairing block + a
recently-added feed below. Standalone graph deferred to its own
future page (with a homepage teaser).

User reasoning for collapsing graph into a featured-pairing
block: a multi-edge graph reads as noise without per-node
context; a single featured pairing is the same value-prop in a
much more legible package.

**Q9.5 — Primary nav.** Three options: (A) flat, (B) two-tier
(content + lens), (C) lens-led. **Locked: B.** Content tier
`Mixtures · Ingredients · Pairings · Recipes` (priority order;
recipes last because secondary). Lens tier `Worldmap · Search ·
Cook mode`, future `Graph`. Mobile collapses to hamburger with
tier section headers preserved.

**Q9.6 — Pairing index page.** Three options: (A) flat list,
(B) endpoint-centric grid, (C) editorial collections. **Locked:
A with a B-style header strip** showing recently-added pairings.
Filters: region, endpoint kind (i×i / i×m / m×m), category. The
"most-paired ingredients" leaderboard variant is deferred until
content density makes it interesting.

**Q9.7 — Search.** Three options: (A) Pagefind, (B) custom JSON,
(C) hosted (Algolia/Typesense). **Locked: A.** Pagefind, full-text,
faceted across all four content types. Per-locale index. Facets
`kind · region · category · flavorProfile · cuisine`. Drafts
excluded automatically (drafts aren't rendered).

**Q9.8 — Recipe demotion.** Three options: (A) keep top-level
URL, (B) nest under primary parent, (C) orphan recipes (no own
URL). **Locked: A.** Recipes keep `/recipes/<slug>/`; demotion
lives in editorial surfaces (excluded from homepage hero,
worldmap, pairing index spotlight; nav last position; cross-linked
from primary content). B was rejected because real recipes
demonstrate multiple ingredients/mixtures, making single-parent
URL artificial.

**Q9.9 — Mixture detail rendering.** Three options: (A) linear
single-column, (B) two-column sticky, (C) tabbed. **Locked: A**
with a "Jump to recipe" button after the summary. User extended
the design with a **cook-mode** view preference: localStorage-
backed, hides encyclopedia/relations/sources/AI events, shows
compact hero + recipe core. Toggleable from lens-tier nav and from
the detail-page hero. Print stylesheet mirrors cook mode. Single
URL, single SSR output, JS-mediated only — crawlers see the full
encyclopedia version.

Cook mode applies to mixture and recipe detail only. Ingredient
pages always render full encyclopedia (an ingredient lookup
mid-cook is by definition encyclopedic intent).

**ADR: `0005-public-site-ia.md`.**

### Q10 — Persistence beyond LocalFsStore

The current `ContentStore` interface has `LocalFsStore` (production
in dev), `InMemoryStore` (tests), and `GitHubStore` (stub). Q10
asked whether Phase 1 ever ships a hosted admin and what shape
that would take.

**Q10.1 — Phase 1 hosting.** Five options: (A) local-only, (B)
local + suggest-only hosted, (C) hosted via GitHub API, (D)
headless CMS, (E) DB. **Locked: A for Phase 1, C for Phase 2.**

User reasoning, paraphrased: _"make sure that this is properly
documented so we know that the storage will always be injected
as an adapter."_ The adapter pattern is the load-bearing
invariant across the phase transition — same admin code, same
content shape, only the store changes.

Sub-decisions:

- ContentStore interface stays single-step `put`. Multi-step
  approval (stage / review / approve) is git PR review, not an
  interface concern.
- GitHubStore stub kept as a documented Phase 2 placeholder. Stub
  comment updated to reference ADR 0006 and clarify env vars.
- Phase 1 editor onboarding documented in README as
  technical-only.
- Audit hook flagged in ADR 0006: any direct `fs/promises` or
  `node:path` use in admin code that bypasses ContentStore is a
  Phase-1 leak that breaks Phase 2.

**ADR: `0006-persistence-adapter.md`.**

### Q11 — Phase 1 → Phase 2 transition criterion

Sub-questions: what does "enough seed" mean, phased-vs-simultaneous
unlock, role model, monetization scope.

**Q11.1 — Criterion shape.** Three families: (A) volume targets,
(B) coverage targets tied to nav surfaces, (C) editorial-readiness
signals. **Locked: B+C hybrid.** Pure volume is too easy to game;
pure readiness is too soft to commit to in advance.

Content gates (B):

- Every region has ≥3 published entries.
- Every mixture `kind` has ≥3 examples.
- Every ingredient `category` has ≥5 examples.
- Every mixture is in the graph (≥1 pairing or recipe).
- Pairings ≥3× mixture count.
- ≥80% ingredients hit recommended-tier completeness.

Capability gates (C):

- GitHubStore battle-tested ≥4 weeks of dogfooded hosted-admin use.
- Auth, moderation queue, attribution shipped and tested.
- AI suggestion suppression proven across ≥4 weeks.
- ≥1 week with no schema change.

**Q11.2 — Phased or simultaneous community unlock.** **Locked: B
phased by stakes** — pairings → recipes → mixtures → ingredients,
with ≥4 weeks of stable moderation outcomes between waves.

User then introduced the **role differentiation** that made the
phasing make sense: rather than "everyone is a contributor," the
project supports a **moderator** tier from Phase 2 day-1.

**Q11.2-extended — Three-role model.** Locked:

| Role         | Where                | Auto-apply         | Entity scope            | Storage               |
| ------------ | -------------------- | ------------------ | ----------------------- | --------------------- |
| lead-curator | localhost (Phase 1+) | ✅ full (ADR 0004) | all, immediately        | LocalFsStore          |
| moderator    | hosted (Phase 2+)    | ❌ no              | all, from Phase 2 day-1 | GitHubStore           |
| contributor  | hosted (Phase 2+)    | ❌ no              | waved unlock            | GitHubStore (PR flow) |

The role boundary aligns with the trust model: **auto-apply
requires localhost** (immediate human proximity for revert);
**full hosted write requires vetting** (moderator); **community
write is always suggestion-only**. Three tiers, three rules.

Why three tiers and not two: a two-tier model would either
bottleneck all content review on the lead curator (killing Phase 2
throughput) or auto-trust community submissions (killing editorial
quality). Moderators are the throughput release valve.

**Q11.3 — Monetization scope.** Three options: (A) never, (B)
Phase 3 only and lightly, (C) Phase 2 already (affiliate). **Locked:
B.** Zero monetization through Phase 2. Phase 3 considers
editorially-aligned channels (affiliate, museum-style sponsorship,
supporter tier) only if all four hold: infra costs are real and
outpace personal funding; channel is editorially aligned; no
content gate; disclosed inline.

Never: display ads, sponsored content masquerading as editorial,
paid placement in pairings or worldmap, content gating, dark
patterns.

User reasoning: editorial integrity is the moat; affiliate revenue
would warp ingredient selection. Phase 2 infra costs are small
(SSG free tier, GitHub free, Pagefind free, auth free at scale)
— nothing to fund.

**ADR: `0007-phase-transition-and-roles.md`.**

### Q12 — README rewrite

Current README is the Vite+ scaffold default. Audience question:
maintainer's-future-self (A), open-source readers (B), or
multi-audience layered (C).

**Locked: B.** README is the front door for an OSS-curious
developer. Owns thesis (in the public-site voice — "growing
atlas of culinary spice. Mostly the chemistry kind."), role model,
dev workflow (`vp install`, `vp dev`, etc.), where to find content
(`/admin/`), and pointers to CONTEXT.md / docs/adr / docs/research /
docs/agents. Decision index lists ADRs 0001–0007 with one-line
summaries. Phase 1 editor onboarding documented as technical-only.

No ADR — README is editorial copy, not architectural.

## Decisions locked this session

1. **Worldmap-led growing-directory homepage.** Hero = worldmap
   (editorial roadmap, empty dots = "planned"). Below: featured
   pairing + recently-added feed. Standalone graph deferred.
2. **Region taxonomy.** Closed enum, multi-valued `region[]` on
   ingredients/mixtures/recipes; not on pairings (derived).
   Macro-region granularity. Distinct from `origin[]` and
   `recipeCuisine`.
3. **Two-tier primary nav.** Content tier (Mixtures · Ingredients
   · Pairings · Recipes), lens tier (Worldmap · Search · Cook
   mode + future Graph).
4. **Pairing index page.** Flat list + recently-added strip.
5. **Pagefind search.** Full-text, faceted across all four
   content types. Per-locale.
6. **Recipe demotion.** Keeps top-level URL; demotion in
   editorial surfaces only.
7. **Linear detail page + cook mode.** "Jump to recipe" anchor;
   cook mode hides encyclopedia for mixture/recipe pages,
   localStorage-backed, print stylesheet mirrors.
8. **ContentStore adapter is the load-bearing persistence
   invariant.** Phase 1 = LocalFsStore (local-only). Phase 2 =
   GitHubStore (hosted). Single-step `put` always.
9. **Three-role model.** lead-curator (localhost, auto-apply) /
   moderator (hosted, vetted, no auto-apply) / contributor
   (hosted, public, waved unlock).
10. **Phase 2 entry criterion.** Six content gates + four
    capability gates; both required.
11. **Waved contributor unlock.** Pairings → Recipes →
    Mixtures → Ingredients; ≥4 weeks of stable moderation between
    waves.
12. **Zero monetization through Phase 2.** Phase 3 considers
    editorially-aligned channels only.
13. **README is the project front door** in the public-site
    voice; CONTEXT.md/ADRs/research stay authoritative.

## Implications — candidate features / changes

### Schema and data model

- Add `region: string[]` enum field to ingredient meta,
  mixture meta, and recipe meta schemas. Pure additions to the
  enum migration-free; splits/merges require content migration.
- Decide the exact ~15–25 region enum (separate sub-task; needs
  seed-content pass).
- Document `region` vs. `origin[]` vs. `recipeCuisine` separation
  in editor onboarding so the three axes don't get conflated.

### Routing and rendering

- Rebuild homepage around worldmap hero + featured-pairing +
  recently-added feed.
- Build worldmap component (SVG dot grid, region aggregation,
  empty-dot rendering).
- New `/pairings/` index page (flat list + recently-added strip,
  region/kind/category filters).
- Two-tier nav component on the base layout.
- Restructure mixture detail to linear order (hero →
  encyclopedia → recipe → relations → liability).
- `/recipes/` and recipe detail templates: keep URLs, add
  cross-link surfaces from mixtures/ingredients.
- Cook mode CSS layer + localStorage toggle script + print
  stylesheet mirror.

### Search

- Integrate Pagefind into the build step.
- Add `data-pagefind-filter` attrs on `kind`, `region`,
  `category`, `flavorProfile`, `cuisine` at render time.
- Build per-locale indexes; switch on active locale.
- Search results page reachable from lens-tier nav.

### Persistence

- Audit admin code for direct `fs/promises` / `node:path` use
  bypassing `ContentStore`. Refactor through the store.
- Document the adapter contract; flag GitHubStore stub as
  Phase 2.
- Add a **Phase 2 readiness dashboard** (admin-only, not public)
  rendering the six content gates with live counts and the four
  capability gates as binary flags.
- Plan GitHubStore implementation for Phase 2 prep — `@octokit/rest`,
  per-contributor branch naming convention, PR template.

### Roles and auth (Phase 2 prep)

- Choose auth provider (Clerk vs. Supabase vs. Auth.js vs.
  WorkOS). Defer until Phase 2 prep starts.
- Define `actor.role` propagation to AI suggestion pipeline:
  `if (actor.role !== "lead-curator") return suggestionOnly`.
- Build moderator queue UI; community-suggestion UI; "your
  suggestion is being reviewed" affordances.

### Documentation

- Three new ADRs (0005, 0006, 0007).
- README rewritten (this session).
- CONTEXT.md updated inline (this session).
- Future "Becoming a moderator" page in `docs/agents/` —
  invitation-only, criteria informal. Defer.

### Tooling / package work

- Worldmap region-list authoring tool (Phase 2 of this work) —
  needs a separate seed-content sub-task.
- Pagefind build integration.
- Phase 2 readiness dashboard module.

## Open questions for next session

None at this layer. Foundation research is complete across the
three 2026-05-02 sessions.

Likely next-layer questions, _not_ opened yet:

- The exact ~15–25 region enum entries. Seed-content sub-task.
- Worldmap visual design (dot styling, projection, region label
  placement). UI work.
- Pagefind UI styling and instant-search dropdown. UI work.
- Migration plan for `spicemixes`/`sauces` → `mixtures`. Build
  task tied to ADR 0002.
- GitHubStore implementation plan. Phase 2 prep task.
- Auth provider selection. Phase 2 prep task.

These belong in a planning doc (PRD or implementation plan), not
in `open-questions.md`.

## Glossary deltas this session (already in CONTEXT.md)

- **Region** added: closed-enum macro-region, multi-valued, on
  ingredients/mixtures/recipes only; distinct from `origin[]` and
  `recipeCuisine`.
- **Public site IA** section added: homepage thesis, two-tier
  nav, index pages, search, detail-page rendering, cook mode.
- **Phases** section expanded with the three-role model
  (lead-curator / moderator / contributor) and the
  persistence-as-injected-adapter principle.
