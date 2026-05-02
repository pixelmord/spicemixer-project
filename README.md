# Spicemixer

A growing atlas of culinary spice. Mostly the chemistry kind.

Spicemixer is a spice-first cooking site built around **the spice
graph**: which ingredients exist, where they come from, what they
taste like, what they pair with, and what you can make from them.
Pairings are the headline relation; mixtures (sauces, blends, rubs,
oils, pickles, chutneys, marinades) are the brand-fit category;
recipes are secondary, included only when they showcase primary
content.

The site is **not** a general recipe collection, a UGC platform
(at least not yet — see Phases below), or a shopping site.

## What's here

- **`apps/website/`** — the Astro SSG site (public + `/admin/`).
- **`packages/content-ai/`** — AI assists for ingestion, link
  detection, translation candidates, suggestion shaping.
- **`packages/recipe-ingestion/`** — PDF / web ingestion pipeline
  that proposes content for editor review.
- **`packages/utils/`** — shared utilities.
- **`docs/adr/`** — architecture decision history. Read these
  before changing anything that looks load-bearing.
- **`docs/research/`** — long-form research sessions. The
  brainstorming trail behind the ADRs.
- **`docs/agents/`** — agent-tooling docs (issue tracker,
  triage labels, domain glossary).
- **`CONTEXT.md`** — the canonical glossary + project frame.
  When code or conversation disagrees with this file, this file
  wins (or it's wrong and gets updated).
- **`AGENTS.md`** — top-level agent instructions.

## Phases and roles

**Phase 1 (now): single editorial.** One curator, localhost-gated
admin. AI assists with extraction, translation, linking; a human
always approves before publish (with narrow auto-apply exceptions
per ADR 0004). Content lands on disk, ships via `git push`.

**Phase 2 (later): community curation.** Hosted admin opens up
when a measurable content + capability bar is hit (ADR 0007).
Three roles govern write access:

- **lead-curator** — localhost, full powers, full auto-apply.
- **moderator** — hosted, vetted, all entity types from Phase 2
  day-1, no auto-apply.
- **contributor** — hosted, public, waved unlock by entity stakes
  (pairings → recipes → mixtures → ingredients), all writes are
  suggestion / draft pending moderator review.

**Monetization:** out of scope through Phase 2. Phase 3 may
consider editorially-aligned channels if infra costs cross the
funding threshold. Never ads, never content gates.

## Running locally

This is a Vite+ monorepo. The `vp` CLI wraps the package manager,
runtime, dev server, tests, lint, and build.

```bash
vp install          # install deps
vp dev              # dev server (Astro)
vp check            # format + lint + typecheck
vp test             # run tests
vp build            # production build
```

The admin UI lives at `/admin/` in dev. It's localhost-only by
design (Phase 1) — see ADR 0006 for the persistence model.

For the full Vite+ command surface, see `CLAUDE.md` or run
`vp help`.

## Where to read first

- New to the project? → **`CONTEXT.md`** (glossary + thesis +
  editorial principles).
- Wondering why something is the way it is? → **`docs/adr/`**.
- Want to see how a decision was reached? → **`docs/research/`**.
- Working with the issue tracker or labels? →
  **`docs/agents/`**.

## Decision index

The ADRs are numbered and named; the short version:

- `0001` — schema.org is the storage format for recipe-bearing
  content.
- `0002` — mixtures and ingredients live in separate collections;
  unification at the reference layer.
- `0003` — per-entry canonical locale (no global EN-first
  requirement).
- `0004` — AI auto-apply boundary and event log.
- `0005` — public site IA: worldmap-led growing directory.
- `0006` — persistence via injected `ContentStore` adapter
  (LocalFsStore now, GitHubStore in Phase 2).
- `0007` — Phase 1 → Phase 2 transition criterion, role model,
  monetization stance.

## License

TBD. Source is open for inspection; reuse terms not yet
formalized.
