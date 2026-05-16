# Lifting content-ai into project-agnostic packages — 2026-05-15

Grilling session via `/grill-me-with-docs`. Walks twelve design branches
to decide whether and how to lift Spicemixer's AI content-suggestion
stack into reusable `@pixelmord/*` packages, with `pixelmord-hq` as a
concrete second consumer.

The execution-shaped output lives at
`/docs/plans/2026-05-15-content-ai-package-lift.md`. This doc captures
the **brainstorming** — what was considered at each branch, why we
rejected alternatives, where the design pressures came from. Use it if
the plan needs relitigation or if a question reopens.

## Frame

Started from the broader architecture-deepening pass
(`/docs/plans/2026-05-15-architecture-deepening-candidates.md`) which
surfaced 6 candidates inside Spicemixer. User pivoted to ask a deeper
question: can the AI suggestion stack be lifted into a project- and
entity-agnostic library so multiple projects can consume it? Specific
second consumer named: `pixelmord-hq` at
`/Users/andreas.adam/workspace/@personal/pixelmordHQ/pixelmord-hq`, with
existing curation actions in `apps/convex-server/convex/curation/`.

The grilling discipline: walk each branch of the decision tree, ask one
question at a time with a recommended answer and reasoning, push back
when the user's framing has a hidden assumption.

## Cross-project context gathered

Spicemixer (this repo):

- `packages/content-ai/src/` — proposers (`curate-*`, `extract-*`,
  `merge-*`, `generate-*`), `events.ts`, `provider.ts` (AI SDK
  `wrapLanguageModel`), `trace/`, `pubsub.ts`.
- `packages/entity-kind/src/` — schemas, registry, completeness, diff,
  kind enum (3 values: ingredient, recipe, pairing).
- `apps/website/src/actions/index.ts` — Astro action handlers,
  per-kind `saveX`, `aiRefreshSuggestions`.
- ADRs 0004, 0006, 0008, 0011, 0012, 0013 directly relevant.

pixelmord-hq:

- Convex Node actions (`"use node"` directive), runs in Convex's Node
  runtime — not a plain Node process but ALS works.
- `convex/curation/categorize.ts` — `categorizePost` (gpt-4o-mini, JSON
  response, returns categories + topics + microformat),
  `deriveEntityFromPost` (full entity extraction with merge candidates
  - tag hints + type-specific shapes for project/idea/todo/worklog/
    habitlog), `refreshDerivedEntityFromPost` (refine existing).
- `convex/curation/suggestRelations.ts` — vector-search-driven relation
  finder using OpenAI `text-embedding-3-small` + Convex `ctx.vectorSearch`.
- Raw OpenAI SDK, no AI SDK. No event log, no trace, no Origin envelope.
- Schemas: 8 derived entity types (project/idea/todo/worklog/habitlog/
  article/reference/externalSource). No Zod; TypeScript types + Convex
  `v` validators at action boundary.

The shape gap is wider than initially assumed:

- Different runtimes (Astro Node vs Convex Node)
- Different LLM SDKs (AI SDK vs raw OpenAI)
- Different schema/validator stacks (Zod vs `v` + TS)
- Different "suggestion" mechanics (per-field LLM proposers vs
  vector-search retrieval for relations; fill from source vs refine
  existing in both)
- Different storage (file sidecars vs Convex tables)

What's shared:

- Both call LLMs, parse JSON, validate against a schema.
- Both have a "start with a seed, enhance into complete content type"
  flow.
- Both will eventually want trace, observability, suppression of
  rejected suggestions.

## The branches walked

### Q1 — What is the second consumer?

Asked because LANGUAGE.md warns: "one adapter = hypothetical seam, two
adapters = real seam." Wanted to know if the lift was justified by
real-world pressure or speculative future-proofing.

Options offered:

- (a) Concrete second project
- (b) Open-source / publish ambition
- (c) Hygiene — clean seam within Spicemixer
- (d) Anticipated future project

**Decision: (a) + (c).** pixelmord-hq exists with concrete curation
code. Honest seam validated by real-world second consumer.

Why this matters: (b) and (d) are traps — they push speculative
extensibility for callers who don't exist. (a) lets us co-design against
two real shapes.

### Q2 — How much should the lifted package dictate the LLM stack?

The gap: Spicemixer = AI SDK v6 + `wrapLanguageModel`. pixelmord-hq =
raw OpenAI SDK. The trace stack (ADR 0011) is built on
`wrapLanguageModel` middleware.

Options offered:

- (a) Require AI SDK v6; pixelmord-hq migrates
- (b) Provider-agnostic with `recordCall` API; AI SDK middleware as one
  optional adapter
- (c) Stay out of LLM invocation; only post-call surfaces

Recommended (b) initially as the "honest middle ground." User overrode
to (a) because:

- pixelmord-hq is young, in flux, migration cost is low
- AI SDK's value (multi-provider including local/self-hosted) is
  desirable independently
- Locking in AI SDK avoids the "portable wrapper that works for both
  SDKs" maintenance burden

**Decision: (a) — AI SDK v6 required.** pixelmord-hq migrates.

Knock-on user framing during this answer: the shared problem is "start
from a seed (ingestion or post), enhance into a complex content type by
filling fields from context." Package's job: take a schema, current data,
per-field system instructions, mode (fill/translate/rewrite), optional
user prompt → return AI-filled fields. Relations as a separate adapter
because they need similarity context.

This framing seeded Q3, Q5, Q7, Q10.

### Q3 — Where do per-field AI instructions live?

Spicemixer's prompts are wildly different per field (`medicinalUses` has
liability disclaimers; `flavorProfile` is taste vocabulary). Can't be
"schema + one generic instruction."

Options offered:

- (a) Inline on the schema via Zod `.describe()` / `.meta()`
- (b) Separate field-config object alongside the schema
- (c) Per-call argument
- (d) Hybrid: schema + override

Recommended (b). Discussed:

- (a) makes the schema a god object; non-AI callers carry prompt
  strings; AI prompt changes become schema migrations.
- (c) duplicates instructions at every call site; auto-apply policy
  needs durable home.
- (d) doubles the surface; per-call overrides invite drift.
- (b) mirrors how Spicemixer separates schema from proposers today.
  Auto-apply allowlist (ADR 0004) becomes a data table.

**Decision: (b).** Coined the term **AI contract** = schema + field
config bundle. Added to CONTEXT.md inline.

### Q4 — Does the package own event-log persistence?

Spicemixer writes events to meta sidecars (JSON files). pixelmord-hq
would write to Convex tables. Same dilemma for trace: JSONL files vs
Convex actions with no writable disk.

Options offered:

- (a) Package owns rules, not bytes — interfaces injected
- (b) Package ships file-based default + interfaces
- (c) Package is storage-aware (`storage: "fs" | "convex"`)

Recommended (a). Discussed:

- (c) couples the package to backends; linear cost growth.
- (b) defaults leak FS assumptions; new consumers stop writing their
  own.
- (a) mirrors ADR 0006's ContentStore pattern.

**Decision: (a).** User added sharp point: "the only thing we need to
prescribe in the interface is what schema the saved data will have so
we can read back from ai event log to comply with the idea that we do
not suggest rejected suggestions again." This is the interface contract
— schema mandated, persistence injected.

This framing later forced the revision in Q12.

### Q5 — How does source material reach the runner?

User's earlier signature `(schema, currentData, mode, userPrompt?)` was
missing the messy inputs: PDF text, post body, tag hints, candidate
lists. "current data" doesn't fit cold-start fill where no entity
exists yet.

Options offered:

- (a) Free-form `Record<string, unknown>`
- (b) Typed-per-contract `Source` type parameter
- (c) Closed enum of context types

Recommended (b). Discussed:

- (c) fails immediately — pixelmord-hq's `tagHints` doesn't fit any
  enum.
- (a) repeats the "cast `unknown` everywhere" trap we're trying to
  eliminate.
- (b) concentrates type discipline at contract registration; per-call
  sites are typed.

Tradeoff: contract gains a second type param (`Source`). Boilerplate
worth it for type strength at every call site.

**Decision: (b).** But this question reopened in Q6 because the user
asked whether to split packages — if A and B are split, only the fill
(A) package needs `Source`.

### Q6 — Should we split packages along the capability seam?

User reframed: "Would it make sense to split along the seam of
capabilities to a) ingest from a source into a schema and b) make
suggestions for filling or improving existing content that already has
a valid schema? Because a) is only needed in projects where the input is
of various sources and b) would work for all projects that have an
entity form."

This was the most important sharpening of the session. Pushed back on
one assumption: pixelmord-hq uses **both** A (deriveEntityFromPost is
A-shape, source → entity) and B (refreshDerivedEntityFromPost is
B-shape, refine existing). Spicemixer uses both. But other future apps
(form-driven CRMs, KB editors) might want B without A.

Applied deletion test:

- Remove A from combined → B-only consumers carry dead code; complexity
  vanishes for them. Seam.
- Remove B from combined → ingest-only consumers carry dead code. Seam.
- Remove substrate → both A and B duplicate. Substrate earns its keep.

Four adapters (2 consumers × 2 capabilities) validate two seams.
Modes also clarified: extract / curate map cleanly to A / B.
sourceContext polymorphism lives entirely in A.

Sub-decision on substrate packaging:

- (a) Standalone substrate package + 2 capability packages
- (b) Substrate folded into refine; ingest depends on refine
- (c) Substrate duplicated in both

Recommended (a). (b) conflates "is foundational" with "is more
commonly used." (c) is duplication.

**Decision: three packages.** User refined naming to keep "content-ai"
prefix:

- `@pixelmord/content-ai-core` (substrate)
- `@pixelmord/content-ai-ingest` (fill)
- `@pixelmord/content-ai-refine` (rewrite/translate)

Naming reasoning: "content-ai" tags scope as typed content operations,
not a generic LLM SDK. Continuity with `packages/content-ai` lineage.

### Q7 — Where does relation/link suggestion live?

User had pre-flagged this as "an adapter, no?" Sharpening: "adapter"
can mean three things — separate package, capability inside refine, or
consumer-side adapter.

Options offered:

- (a) Fourth package `content-ai-relate`
- (b) Capability inside refine
- (c) Pure consumer-side adapter

Looked at both projects:

- pixelmord-hq's `suggestRelations`: vector-search retrieval, OpenAI
  embeddings + Convex `vectorSearch`, no LLM inference.
- Spicemixer's `aiAutoLinkIngredients`: LLM-on-text slug detection,
  ADR 0004 auto-applied.

Two genuinely different mechanisms wearing the same hat. Shared rule
across them is thin.

Recommended (c) with upgrade path to (a). Strict "one adapter =
hypothetical, two = real" applied — today zero adapters use the
substrate for relations.

**Decision: (c).** Promote to package only when consumer-side
duplication becomes visible.

### Q8 — Call granularity — per-field vs whole-entity?

Both projects need both shapes:

- Spicemixer `aiRefreshSuggestions` = multi-field
- Spicemixer EnhanceModal = per-field
- pixelmord-hq `derive` = whole entity
- pixelmord-hq per-field tweak (would exist) = per-field

Options offered:

- (a) One call shape, target selector, response always a Map
- (b) Two distinct exports (`runRefineEntity` + `runRefineField`)
- (c) Discriminated response shape

Recommended (a). Discussed:

- (c) forces every caller to switch on shape.
- (b) creates name-the-thing problem on adjacent concerns; doubles
  plumbing.
- (a) is uniform: always returns `Map<FieldPath, FieldSuggestion>`;
  single-field call gets one-entry map.

Subtle seam: caller never controls number of LLM calls. Runner can
batch / parallelize / chunk based on context-window heuristics. Pure
implementation concern.

**Decision: (a).**

### Q9 — Prompt as string, function, or structured spec?

Spicemixer's curate-\* prompts assemble dynamically: per-field
instruction + entity state + rejected-suggestion context + user prompt.
Static strings can't carry that.

Options offered:

- (a) Static `systemPrompt: string`
- (b) Builder function `(ctx: PromptContext) => string`
- (c) Structured spec `{ instructions, examples?, constraints? }`

Recommended (b). Discussed:

- (a) too rigid; package wrapper template can't handle every project's
  prompt-engineering tricks.
- (c) is just (b) with constraints; package shouldn't dictate prompt
  shape.
- Evals don't suffer: AI Trace records final assembled string anyway.

Sub-claims accepted:

- Runner pre-fetches rejected suggestions from event log adapter (needed
  for suppression check anyway); passes them via PromptContext;
  builder decides whether to format in.
- `userPrompt` is per-call, not on the contract.

**Decision: (b).**

### Q10 — Modes — fixed enum, open per package, or open per consumer?

By this point fill/rewrite/translate trio was looking like it was doing
less work than its name suggested. Capability axis was handled by the
package split. Response shape was always a Map. Auto-apply was per-field
not per-mode.

Options offered:

- (a) Closed enum per package
- (b) Open string per package
- (c) Modes don't exist as top-level concept

User's response was the sharpest moment of the session: "on field level
we might have empty fields or fields that could need more items or
fields where we have some text but we want to change the tone of voice
or we want to have a longer text or we want to do some research. So
either prompt presets upon user entry or prompt presets that can be
amended by the user (that is probably what I was thinking when I
mentioned 'modes')."

This dissolved the mode enum. The user identified that what they
originally called "modes" were actually two distinct things conflated:

1. Capability (fill vs refine) — already handled by package split
2. User-facing intent (expand, change tone, research, translate, …) —
   a different thing entirely

Reframed as **presets** — repeatable user-facing intents declared on the
contract, opt-in per field, optionally amended by free-text userPrompt.

Translate collapsed into a preset (`translate-de`, `translate-fr`) with
`autoApplyOverride: { policy: "never" }` per ADR 0004. Mode parameter on
the runner went away entirely.

**Decision: (c) — but enriched into preset machinery.**

### Q11 — Presets at contract level or per-field?

Options offered:

- (a) Contract-level pool + per-field `presetIds` allowlist
- (b) Per-field preset arrays
- (c) Both — pool + per-field overrides

Recommended (a). User's exact phrase: "those things are repetitive
across fields." (b) defeats the DRY purpose. (c) creates two places to
look.

**Decision: (a).** Added **Preset** to CONTEXT.md inline.

### Q12 — Event log adapter write API + pruning

Drafted the `AiEventLog` interface. Wrinkle: pruning (ADR 0004's
100-event cap, priority order) needs to know events to remove. Three
shapes for the write side:

- (a) Two methods `append` + `delete`
- (b) One method `compactAndAppend` (atomic remove + append)
- (c) Single `append`, adapter does its own pruning

Recommended (b). (a) is non-atomic across two Convex mutations. (c)
leaks rules into every adapter.

User pushed back hard with two genuine concerns:

1. "How do we make sure that we do not delete suggestions and then we
   annoy the user coming back with previously rejected ones?" — Already
   addressed by ADR 0004's "never prune rejected, never prune
   ingested" rule.
2. "Is the log size really an issue since this is per entity instance
   and I would say that you can only suggest so many edits on one
   entity. And if a consumer expects very many events then they can use
   a storage adapter that is suitable like an event stream db or kv
   store that does not care about many appended events."

Point 2 dissolved the pruning machinery. The 100-event cap in ADR 0004
was justified specifically because _file-based sidecars_ grow
unwieldy. That's a property of the **storage choice**, not the
**rules**. Convex tables, KV stores, event streams don't care.

Revised the answer: pruning is wholly an adapter concern. Core exposes
`isPrunable(event)` (false for rejected and ingested) and
`planPrune(events, capHint?)`. Adapters that have size pressure call
`planPrune` before write. Adapters that don't, just append.

**Decision: revised to (a)-with-helpers.** Adapter interface is `read`

- `append`. Pruning machinery moves into core helpers that adapters opt
  into. Atomicity worry disappears — pure append is one op in every
  backend.

User's sign-off check: "The package's promise is: events of these four
types, these fields, with this suppression behavior — not 'and they
will be pruned.' Pruning lives wholly in adapter-land, with core
supplying the safety predicate."

This was also the natural wrap-up point.

## Conventions established during grilling

- **AI contract**: schema + presets + field configs bundle. (CONTEXT.md)
- **Preset**: user-facing AI intent within refine. (CONTEXT.md)
- **PromptContext**: typed envelope passed to prompt builder functions.
- **FieldConfig**: per-field `systemPrompt` + `autoApply` + `presetIds`.
- **EntityRef**: `{ kind: string; id: string }` — open string per
  consumer, no central registry. The lifted version is structurally
  identical to Spicemixer's existing `{ collection, slug }` pattern.

## Implications

Lifted into the execution plan
(`/docs/plans/2026-05-15-content-ai-package-lift.md`):

- Three packages with declared boundaries.
- Concrete TypeScript shapes for `AiContract`, `Preset`, `FieldConfig`,
  `PromptContext`, `FieldSuggestion`, `AiEventLog`, `TraceSink`,
  `Origin`.
- Adapter interfaces injected at runner construction.
- ALS exposed by core; consumers wrap entry boundaries with
  `withOrigin`.
- Migration sequence in 7 steps, starting with in-Spicemixer deepening
  before any package extraction.
- ADR 0014 to be written when step 2 (core package exists, unpublished)
  is committed.

## Open follow-ups deferred

Surfaced during grilling, not resolved:

1. `packages/entity-kind` survival after the lift.
2. AutoApply execution site (runner-side vs consumer-side).
3. AI Trace sinks in core (as defaults) vs adapters.
4. Contract registration pattern (currently: no registry, values only).
5. Event ID generation (core-generated UUIDs vs adapter-generated).
6. Append serialisation contract for per-entity locking.

## When to revisit

- After step 1 of migration (AiEventLog deepening in Spicemixer alone)
  surfaces unexpected friction.
- Before publishing the three packages outside the monorepo.
- When `suggestRelations`-style retrieval becomes the third concrete
  capability across two consumers (promote relations to a fourth
  package).
- If a third consumer appears with a fundamentally different runtime
  (Cloudflare Workers, Deno, browser-only) — re-test the ALS assumption.

## Reference

- Sibling plan: `/docs/plans/2026-05-15-architecture-deepening-
candidates.md` (the 6 deepening candidates that led to this lift
  conversation).
- Sibling plan: `/docs/plans/2026-05-15-content-ai-package-lift.md`
  (the execution-shaped output of this session).
- ADRs cross-referenced during grilling: 0004 (auto-apply boundary +
  event log shape), 0006 (persistence adapter pattern parallel), 0008
  (EntityKind seam this builds on), 0011 (AI observability stack
  lifts wholesale), 0012 (source artifact storage), 0013 (meta
  sidecar carries workflow state).
- Second-consumer code referenced:
  `/Users/andreas.adam/workspace/@personal/pixelmordHQ/pixelmord-hq/apps/convex-server/convex/curation/categorize.ts`,
  `.../suggestRelations.ts`.
