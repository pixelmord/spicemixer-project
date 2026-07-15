# Worldmap is a generated dot-matrix with build-time seeded placement

The homepage hero worldmap shows the 23 culinary **regions** (see CONTEXT.md →
Region) as a dotted world silhouette: each region is rendered as a cluster of
dots, and dots that have content "light up" and link to an item plus that
region's filtered list.

Two facts forced a design: (1) the only accurate continent silhouette we have
is a hand-built **coarse** dot grid (`worldmap-static`, 38×68) that knows
continents (`asia`, `africa`, …) but **not** our 23 sub-continental regions;
(2) content coverage is sparse and uneven — today ~6 of 23 regions have any
mixture or recipe — and changes per build and per locale.

## Decision

Render the worldmap as a **dot matrix in two layers**, both resolved before the
browser, plus **HTML/CSS-Grid** output (not SVG).

**Layer 1 — silhouette + region assignment (static, committed).** A build-time
generator (`scripts/gen-worldmap-dots.ts`) parses the coarse static grid,
upscales it 2× to **76×136**, and assigns every land dot to one of the 23
regions via a hand-authored **boundary table** (column/row ranges per region).
It emits a committed `src/lib/worldmap-dots.ts` (`{col, row, regionId}[]`, water
dropped). This is the single source of truth for _where regions are_. It is
re-run by hand when boundaries are tuned; the output is reviewed in the diff.

**Layer 2 — item placement (dynamic, per-build, per-locale).** A pure helper
(`src/lib/worldmap-placement.ts`), called from `HomePage.astro` per locale,
takes published mixtures+recipes ordered **mixtures-first, then `datePublished`
descending**, and assigns each item to **one** empty dot inside one of its
regions using a **seeded PRNG** (keyed off slug). Same content → same layout;
diffs are stable; a region with no content simply has no filled dots.

Region presentation metadata (label, **color**, **group**) is centralised in
`src/lib/regions.ts` — extending the existing label/source-of-truth module —
so the component holds no parallel region table.

Rendering is **HTML + CSS Grid**: a `136×76` grid where only land dots emit DOM
(~1,500 elements); filled dots are focusable `<a>`s, empty dots are inert
region-colored rings. The committed Layer-1 format is rendering-agnostic.

## Motivation

- **Accuracy without a bespoke asset.** The coarse static grid already encodes a
  recognisable world shape. Subdividing it into regions reuses that work; we
  avoid commissioning/maintaining an SVG map and avoid the placeholder
  `DOT_POSITIONS` guesswork.
- **Sparse content shouldn't lie.** Per-build, per-locale placement means the
  map reflects _actual_ published content; empty regions look planned, not
  faked. This is why placement can't live in the committed Layer-1 file.
- **Determinism.** Seeding makes "random" placement reproducible — no build-noise
  diffs, no flaky tests, stable visuals.
- **HTML over SVG.** We draw only circles. DOM elements give us native
  focusability, `:hover`/`:focus-visible`, screen-reader labels, and
  `getBoundingClientRect()` popover anchoring — all awkward in SVG — while CSS
  Grid + `aspect-ratio` keeps responsive scaling. SVG's vector advantages are
  unused here.

## Consequences

- **Region boundaries are an approximation.** The static map has no
  sub-continental data; the boundary table is authored by eye and will need
  visual tuning. It is the accepted cost of not drawing a real map.
- **Two "build-time" homes.** Silhouette generation lives in `scripts/`
  (committed output); placement lives in `src/lib/` (runs during the Astro
  build). Contributors must know which layer a change belongs to.
- **Re-running the generator is manual.** Boundary edits require running the
  script and committing the regenerated `worldmap-dots.ts`; it is not part of
  the normal build.
- **Region landing pages are filtered indexes.** Popover region links point at
  `/recipes/?region=X` and `/mixtures/?region=X`; this required adding a
  `region` filter dimension to both indexes (and fixed a previously dead
  `?region=` link). A dedicated `/regions/[code]/` route is a deferred follow-up.

## Alternatives considered

- **Designed SVG map asset.** Most accurate visually, but a maintenance burden
  and overkill for a dotted-hero aesthetic; loses the dot-grid language.
- **Runtime HTML parsing / placement in the browser.** Ships dead markup and
  non-deterministic layout; rejected.
- **Hardcoded dot array in the component** (as the prototype did). Unmaintainable
  at 2× density and drifts from `regions.ts`.
- **One representative item per region** instead of one-item-per-dot. Simpler,
  but hides how much content a region actually has.
