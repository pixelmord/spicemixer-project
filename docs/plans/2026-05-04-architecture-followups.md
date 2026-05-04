# Architecture follow-ups — deferred from 2026-05-04 session

The codebase-intelligence + improve-architecture session on 2026-05-04
identified seven deepening candidates. Two were taken (EntityKind seam
→ ADR 0008, AiEventLog → issue #62). Five remain deferred. This file
is the resume-point for a future session.

Status legend: **open** = no work scheduled. **partial** = partly
absorbed by the EntityKind/locale-storage arc; the residual concern
is what's left to address.

---

## 1. EntityRef seam is shallow — collection-branching leaks (partial)

**Files:** `apps/website/src/lib/entity-ref.ts`,
`apps/website/src/actions/index.ts:228,461,1143`,
`apps/website/src/lib/pairings.ts`.

**What's leaking:** `EntityRef = { collection, slug }` is the seam
CONTEXT.md promises ("ingredients and mixtures unify at the reference
layer"). But the interface is too thin — callers branch on
`collection` constantly. Meta-sidecar fetch differs for
recipes/mixtures vs ingredients; delete handlers branch; pairings need
a defensive `EntityRef | string` coercion.

**What's already addressed:** ADR 0008 "Open follow-ups" notes the
EntityRef↔EntityKind mapping (`collectionToKind: { ingredients:
"ingredient", recipes: "recipe", mixtures: "recipe", pairings:
"pairing" }`) lives in the registry and the default is to derive
`kind` from `collection` rather than carry both fields.

**Residual:** the _behaviour_ leak (callers branching on collection)
isn't closed by deriving kind from collection alone. Once the
EntityKind seam ships, audit the branch sites and either:

- promote them to ask the EntityRef "fetch your meta" / "which
  collection do I delete from" (deep), or
- accept that the branches are honest variation that doesn't fit a
  registry call (shallow but acceptable).

The deletion test: today the abstraction earns its keep but is
underweight. After EntityKind, this becomes "is it earning enough?"

**Reopen when:** issues #61–#64 land and the EntityKind registry has
real consumers. Then walk the branch sites with the question above.

---

## 2. ContentStore is a pass-through — CollectionRouter sits above (open)

**Files:** `apps/website/src/lib/content-store.ts`,
`apps/website/src/lib/stores/{local-fs,github,in-memory}.ts`.

**What's leaking:** Each adapter independently implements
collection-specific list logic — multi-dir walks for `meta`,
client-side filter for `ingredientMeta`, exclude-`.meta.json` for
normal collections. fallow flagged `LocalFsStore.list` and
`GitHubStore.list` as unused class members; the entry point is
`list()` but the heavy lifting is in private helpers per adapter. Two
adapters now means routing logic exists in two places.

**Solution direction:** push collection-routing into a
`CollectionRouter` module sitting above `ContentStore`. Adapters drop
to four pure I/O methods.

**Does NOT contradict ADR 0006** — that ADR fixes the interface shape
(`put` single-step, no stage/review states), not where
collection-routing lives. Worth flagging at the top of the new ADR
when we write one.

**Deletion test:** delete the (hypothetical) CollectionRouter and
collection logic spreads back across both adapters and probably leaks
into callers — concentrating it earns its keep.

**Reopen when:** ADR 0009 migration (issue #63) lands and the
`<collection>/<locale>/<slug>.json` layout is uniform. The asymmetry
that motivated the per-adapter list logic disappears, making this a
clean refactor instead of a behaviour change.

---

## 3. MetaRef is forked — two shallow types racing (partial)

**Files:** `apps/website/src/lib/meta-sidecar.ts:9`,
`apps/website/src/lib/recipe-augment.ts:16`.

**What's leaking:** Both export a type called `MetaRef`.
`meta-sidecar.MetaRef` (admin path) carries `locale?`;
`recipe-augment.MetaRef` (public read path) doesn't and omits
`pairings`. Same name, different shape, mutually-exclusive call
paths. fallow flagged the duplicate.

**What's already addressed:** ADR 0009 "Consequences → Code" lists
the convergence as part of issue #63's work — locale becomes always
required, the two definitions collapse onto a single shape. So this
is scheduled, not deferred — kept here only because the
`recipe-augment.ts` dumping-ground problem (it also exports
`IngredientLink`, `ExternalSource`, `Meta`) is a separate cleanup
that #63 doesn't touch.

**Residual:** after the MetaRef merge, `recipe-augment.ts` should be
audited as a module. Is it the public read facade for entity
metadata, or a grab-bag? Promote or split.

**Reopen when:** issue #63 lands.

---

## 6. CompletenessModel leaks thresholds — utility, not abstraction (open)

**File:** `apps/website/src/lib/completeness.ts`.

**What's leaking:** Module returns `{ score, missing, color }` but
the model leaks. Hard-coded `>=80 green / >=40 amber` thresholds in
the function. `RECIPE_REQUIRED` / `RECIPE_RECOMMENDED` /
`INGREDIENT_REQUIRED` exported as separate consts. Callers reach in
for thresholds when deciding what to render. Tier definitions are
not encapsulated — they're scattered over consts and inline ifs.

**Solution direction:** promote to a `CompletenessModel` module that
owns the tier definitions, the per-kind required/recommended sets,
and the score-to-tier mapping behind a single interface. The
`completeness` field on the EntityKind registry (ADR 0008) is the
natural attachment point — each kind's config carries its
completeness model instead of the global file exporting per-kind
consts.

**Deletion test:** delete `completeness.ts` today and forms hardcode
the thresholds inline — same friction relocated. Currently a utility
that pretends to be an abstraction.

**Reopen when:** issue #61 lands. The registry gives this a natural
home and the tier definitions move with their per-kind config.

---

## 7. PublishedView would unify locale-fallback + hreflang (open)

**Files:** `apps/website/src/lib/published-entity.ts`,
`apps/website/src/lib/hreflang.ts`,
`apps/website/src/pages/{de/,}{ingredients,recipes,mixtures}/[slug].astro`.

**What's leaking:** Detail pages call `resolvePublished` (gets
`{ entity, canonicalLocale, isFallback }`) AND `hreflangTags` (which
internally re-resolves all locales). Two parallel resolutions per
page; `isFallback` is computed twice. Adjacent to the locale page
duplication tracked in issue #59 / #60.

**Solution direction:** a `PublishedView` module returning resolved
entity + fallback-banner data + hreflang tags from one resolution
pass.

**Deletion test:** delete `hreflang.ts` and the `resolvePublished` +
iterate-locales pattern would spread across 6 page files. Both
modules earn keeping; they just don't share a seam yet.

**Reopen when:** issue #59 (HITL i18n routing decision) settles. The
shape of `PublishedView` depends on which routing strategy wins
(Astro built-in i18n vs shared layout vs status quo).

---

## How to resume

In a future session, run `/improve-codebase-architecture`, point at
this file, and pick a candidate. Each entry above carries the
deletion-test framing and the trigger ("Reopen when:") so we don't
re-litigate the candidate selection — just step into the grilling
loop on the picked one.

Cross-reference: ADR 0008 (EntityKind seam), ADR 0009 (locale
storage), issues #52, #53, #55, #56, #61, #62, #63, #64.
