# Phase 1 → Phase 2 transition criterion, roles, monetization

Phase 2 (community curation) starts only when Phase 1 hits a measurable
content-and-capability bar. Three write-access roles govern the move:
**lead-curator** (localhost, full powers), **moderator** (hosted,
vetted, all entity types from Phase 2 day-1), **contributor** (hosted,
public, waved unlock by entity stakes). Monetization is **out of scope
through Phase 2**; Phase 3 considers narrow editorially-aligned channels
only if infra costs outpace personal funding.

## Why this ADR

Prior decisions left Phase 2 entry as a vague "when there's enough seed
content." That phrasing avoids the actual decision and risks Phase 2
launching either too early (community contribution becomes the _only_
content path) or never (no measurable bar to hit). This ADR pins the
criterion, the role model that makes it operable, and the monetization
posture so editorial choices in Phase 1 aren't unconsciously shaped by
Phase 3 revenue questions.

## Phase 2 entry criterion

**Both content gates and capability gates must be met.** Either alone
is insufficient — content without capability launches into a broken
admin; capability without content launches into a vacuum that
community fills with low-quality submissions.

### Content gates

Tied to navigation surfaces, not raw counts. Each gate ensures that
_every place a community contributor or new reader might land_
already has editorial spine.

- **Region coverage.** Every region in the locked enum has ≥3
  published entries (mixtures or ingredients combined). No empty
  dots in the "core" tier of the worldmap. Empty dots in fringe
  regions are acceptable but flagged in the editorial backlog.
- **Mixture kind coverage.** Every `kind` (`spicemix`, `sauce`,
  `rub`, `oil`, `pickle`, `chutney`, `marinade`) has ≥3 published
  examples. No empty kind index pages.
- **Ingredient category coverage.** Every `category` (`spice`,
  `herb`, `seed`, `salt`, `acid`, `allium`, `dried-fruit`) has ≥5
  published examples.
- **Graph connectivity.** Every published mixture has ≥1 published
  pairing involving it OR ≥1 published recipe that uses it. No
  mixtures stranded outside the relationship graph.
- **Pairing density.** Pairing count is ≥3× the count of published
  mixtures. Each mixture pulls its weight in the graph.
- **Ingredient completeness.** ≥80% of published ingredients have
  `flavorProfile`, `region`, `culinaryUse`, and `images[0]` filled
  (recommended-tier completeness from the Q6 schema spec).

### Capability gates

- **Hosted admin proven.** `GitHubStore` (ADR 0006) implemented,
  deployed, and used by the lead curator for ≥4 weeks of dogfooded
  hosted-admin writes. Every code path that LocalFsStore exercises
  must also work via GitHubStore.
- **Auth, moderation queue, attribution.** All shipped and tested
  with the lead curator playing both moderator and contributor
  roles in a staging environment.
- **AI suggestion suppression proven.** The `(field, suggestion.hash)`
  rejection memory from ADR 0004 has produced ≥4 weeks of evidence
  that the same rejected suggestion is not re-surfaced. Demonstrate
  the dedupe layer works _before_ community-volume hits it.
- **Schema stability.** ≥1 full week with no schema or ADR change
  affecting the content shape. Schema churn before Phase 2 makes
  contributor migrations a nightmare.

### Alternatives rejected

- **Pure volume targets** (e.g. "≥80 atomic ingredients, ≥150
  pairings"). Easy to game; disconnected from why Phase 2 exists.
  Hitting 100 entries doesn't mean the worldmap looks lived-in.
- **Pure editorial-readiness signals** ("looks lived-in, feels
  ready"). Too soft to commit to in advance.
- **Single gate without capability checks.** Risks launching a
  hosted admin still carrying localhost assumptions (sync fs ops,
  process-local locks) per ADR 0006.

## Role model

Three roles, each with a single rule for AI auto-apply and write
behavior. The boundaries align with the trust model: auto-apply
requires localhost; full hosted write requires vetting; community
write is always suggestion-only.

### lead-curator

- **Where:** localhost. Phase 1 onward. Single human (the project
  owner).
- **Storage:** `LocalFsStore` (writes JSON to disk; ships via
  `git push`).
- **AI auto-apply:** **enabled**, per the ADR 0004 allowlist.
  Localhost trust + immediate human proximity for revert.
- **Write behavior:** single-step `put`; no review queue.

### moderator

- **Where:** hosted admin. Phase 2 day-1.
- **Storage:** `GitHubStore` (commits to main directly, or to a
  moderator-owned branch with auto-merge after CI green).
- **Entity scope:** **all entity types from day-1.** No waved
  unlock — moderators are vetted curators with full editorial
  trust.
- **AI auto-apply:** **disabled.** Auto-apply stays localhost-only
  because ADR 0004's threat model assumes immediate human
  proximity for revert. Hosted moderators don't have that
  proximity. AI is suggestion-only for them; suggestions land in
  a fast-track review queue.
- **Write behavior:** single-step `put`; submissions visible
  immediately. Audit trail in git history.
- **Granted by:** lead curator only. No self-service application.

### contributor

- **Where:** hosted admin. Phase 2.
- **Storage:** `GitHubStore` (commits to a per-contributor branch;
  PR opened on submit; awaits moderator review).
- **Entity scope:** **waved unlock by editorial stakes.** Each
  wave unlocks only when the prior wave has produced ≥4 weeks of
  stable moderation outcomes (defined as: <10% submissions
  rejected outright, no rollbacks of merged community content,
  moderation queue not growing faster than it drains).
  - **Wave 1 (Phase 2.0):** community pairings. Self-contained
    relation, two endpoints + description. Low blast radius.
  - **Wave 2 (Phase 2.1):** community recipes (linked third-party
    - on-site). Recipe-bearing but already a "secondary" content
      type per ADR 0005's IA.
  - **Wave 3 (Phase 2.2):** community mixtures. Recipe-bearing
    AND encyclopedia content; both axes need moderation
    discipline.
  - **Wave 4 (Phase 2.3):** community ingredients. Highest
    stakes: medicinal/health/safety claims, taxonomy, sources.
    Hard guardrails: medicinal/health/safety sections require
    sources or fail validation. Community-origin entries default
    to `draft` status pending moderator review.
- **AI auto-apply:** **disabled** (per ADR 0004's
  `if (origin === "community") return suggestionOnly`).
- **Write behavior:** all writes are suggestion / draft. Nothing
  ships without moderator approval.

### Why three tiers and not two

A two-tier model (lead-curator + community) would either (i) bottleneck
all content review on the lead curator, killing Phase 2 throughput, or
(ii) auto-trust community submissions, killing editorial quality.
Moderators are the throughput release valve. They share the lead
curator's editorial judgment but trade auto-apply convenience for
hosted-admin reach.

### Role enforcement

Roles are stored on the user identity in the auth layer (Phase 2
choice — Clerk / Supabase / Auth.js TBD). The `ContentStore` adapter
is unaware of roles; role checks live in the admin UI layer above
the store. The store sees writes; it does not see who-can-do-what.

## Monetization

**Through Phase 2: zero monetization.** No ads, no affiliate links,
no paid tier, no sponsorship, no "premium" content, no email capture
funneling, no dark patterns.

**Phase 3 (if it happens) considers monetization only if all four
hold:**

1. Infra costs are real and outpace personal funding.
2. The channel is _editorially aligned_ — an affiliate link to a
   spice merchant the editor would link to anyway; a sponsorship
   that names a region's content like a museum exhibit credit; a
   "supporter" tier with no content gate.
3. It carries no content gate. All content stays open.
4. All monetization is disclosed inline.

**Never:** display ads, sponsored content masquerading as editorial,
paid placement in pairings or the worldmap, content gating, dark
patterns.

### Why the no-monetization stance is locked through Phase 2

**Editorial integrity is the moat.** "Polish over volume" + "AI
suggests, editor decides" + sources required on medicinal claims —
these only mean something if the curator isn't optimizing for
engagement / clicks. Affiliate revenue would warp ingredient
selection and pairing emphasis. Display ads change incentives on
session time and bounce rate.

**Phase 2 infra costs are small.** Vercel/Netlify free tier handles
SSG; GitHub API for admin is free; Pagefind has zero infra. Auth
(Clerk / Supabase free tier) is essentially free at launch scale.
There's nothing to fund.

### Alternatives rejected

- **A. Never monetize.** Closes off legitimate Phase 3 options
  (printed-book deal, supporter tier with no gate, regional
  retailer partnerships handled like editorial credits).
- **C. Phase 2 already, lightly.** Bakes monetization into the
  launch surface. Once affiliate links ship, removing them later
  signals decline. Better to never start than to start small and
  unwind.

## Consequences

### Tracking and visibility

- Add a **Phase 2 readiness dashboard** (admin-only). Renders the
  six content gates with live counts and the four capability
  gates as binary flags. Editor sees at a glance how close
  Phase 1 is to closing.
- Surface the dashboard in the admin sidebar. Don't expose it
  publicly.

### Schema

- No new schema fields required by Phase 1. Role and origin live
  on the user identity (Phase 2). The existing `aiEvents[]` log
  already captures `source` for ingestion; community-origin
  attribution lives in the per-entry meta sidecar's existing
  draft/published machinery + git history (commit author).

### Code

- `ContentStore` adapter is role-agnostic per ADR 0006. Role
  enforcement lives in the admin UI layer.
- AI suggestion pipeline gains a runtime check: `if (actor.role
!== "lead-curator") return suggestionOnly` (extends the existing
  `if (origin === "community") return suggestionOnly` from
  ADR 0004).
- Add a `PhaseReadiness` query module that aggregates the six
  content gates from the content collections.

### Documentation

- README (Q12) names the three roles in the project overview so
  community contributors understand what's open to them.
- This ADR is the canonical source for the Phase 2 entry bar; the
  open-questions doc moves Q11 to Closed.
- A short "Becoming a moderator" page lives in `docs/agents/` or
  similar — invitation-only, criteria informal.

## Open follow-ups

- Auth provider choice for Phase 2 (Clerk vs. Supabase vs.
  Auth.js vs. WorkOS). Defer until Phase 2 prep starts.
- Moderator promotion criteria — formal or informal. Defer.
- Phase 2.0 launch checklist (UI affordances for "your suggestion
  is being reviewed," moderator queue UI, attribution display).
  Defer until Phase 2 work begins.
- Whether the Phase-2 readiness dashboard counts go in commit
  metadata for historical tracking. Defer.
- Phase 3 monetization revisit — only if and when infra costs
  cross the funding threshold.
