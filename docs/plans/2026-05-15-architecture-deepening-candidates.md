# Architecture deepening candidates — 2026-05-15

Surfaced via `/improve-codebase-architecture`. Six places where modules are
shallow or seams are half-built. Each entry uses the deletion-test framing:
would removing the module concentrate complexity (deep) or just shuffle it
(shallow)?

Ordering note: (2) → (1) → (3) → (6) is the natural chain. (4) and (5) are
independent.

---

## 1. AiEventLog seam — named in CONTEXT.md, not yet materialised

**Files**

- `apps/website/src/actions/index.ts` — saveRecipe (~344), saveIngredient
  (~393), savePairing (~458), aiRefreshSuggestions (~1477).
- `packages/content-ai/src/events.ts` — utility bag: `recordAiEvent`,
  `prune`, `isSuppressed`, `filterSuggestions`, `appendEvent`.
- `apps/website/src/components/admin/AiAssistPanel.tsx`,
  `NewRecipePage.tsx`.

**Problem.** Today's pattern: fetch raw meta → cast `aiEvents` → call a
utility → write back. Repeated in 5+ sites, including a client component.
CONTEXT.md promises a module that owns the read-modify-write cycle and
exposes a fingerprint cache for "have we seen this exact AI input before."
Deletion test on `events.ts`: shallow — each function is a one-line array
op; the real logic (dedup, suppression, persistence) reappears at every
caller.

**Solution.** A stateful `AiEventLog` bound to a `ContentStore` +
`MetaSidecar`. Interface: `read(ref)`, `append(ref, event)`,
`shouldSkip(input)`, `buildRejectedContext(ref)`. `events.ts` becomes
implementation detail behind it.

**Test impact.** Proposer/runner tests get a fake `AiEventLog`. Suppression
rules become unit-testable without disk I/O.

---

## 2. Meta sidecar has no typed schema — every caller hand-casts

**Files**

- `apps/website/src/lib/meta-sidecar.ts` (byte-level adapter).
- `lib/recipes.ts`, `lib/ingredients.ts`, `lib/pairings.ts`,
  `actions/index.ts buildListing` (~231).

**Problem.** `MetaSidecar` is a JSON blob adapter. Callers do
`(existing?.data as Record<string, unknown>) ?? {}` then string-key into
`canonicalLocale`, `canonicalContentHash`, `translationStaleSince`,
`aiEvents`. Adding a meta field is a grep-the-codebase operation. ADR 0013
says meta is "workflow state, not site-specific data" — but the type of
that state isn't expressed anywhere.

**Solution.** Typed `EntityMeta` (Zod schema, single source of truth) plus
a thin reader/merger above the sidecar. Sidecar stays the byte-level
adapter; `EntityMeta` is the schema interface.

**Test impact.** Schema fixtures replace loose objects.

---

## 3. saveRecipe / saveIngredient / savePairing — same function three times

**Files** — `lib/recipes.ts:14-45`, `lib/ingredients.ts:14-47`,
`lib/pairings.ts:16-47`.

**Problem.** All three: read existing → resolve canonical locale → compute
content hash → if hash changed call `flagTranslationsStale` → write.
Differences are field names. This is the per-kind code that should sit
above the EntityKind seam.

**Solution.** Single `saveEntity({ ref, content, meta })` using the
EntityKind registry for hash + stale-flag rules. Per-kind wrappers go away.

**Test impact.** One contract test ("changing canonical content flags
translations stale") covers all kinds.

---

## 4. Source store has `put` but no `get` — reads bypass the seam

**Files** — `apps/website/src/lib/stores/source-store.ts`,
`actions/index.ts` (~177-209), direct `node:fs` reads under
`data/sources/<hash>/`.

**Problem.** Writes go through `LocalSourceStore.put*` (good). Reads do
manual `join(process.cwd(), "data/sources", ...)` + `readFile` + parse
(bad). ADR 0012 specifies directory shape; the seam is half-built. **One
adapter = hypothetical seam** — and reads don't even use the one adapter.

**Solution.** Extend `SourceStore` with `getBinaryMeta`,
`getTextArtifact(strategy, version)`, `getStructuredArtifact(traceId)`.
Phase-2 S3 swap becomes mechanical.

**Test impact.** Ingestion path tests stop needing tmp dirs.

---

## 5. Admin forms duplicate AI-suggestion orchestration ~3×

**Files** — `RecipeForm.tsx` (~2100 LOC), `IngredientForm.tsx` (~1500
LOC), `PairingForm.tsx` (~560 LOC).

**Problem.** JSX differs per kind (correct). But the orchestration above
the JSX — accept suggestion → recordAiEvent → filter suppressed → merge
into form state → submit — is copy-pasted. CONTEXT.md explicitly says
"form state hook + AI orchestration runner live above the seam, shared
across kinds." Today they don't.

**Solution.** Headless `useAiSuggestions(kind, ref)` hook owning the
suggestion lifecycle. Forms render fields, call the hook.

**Test impact.** Suggestion state machine becomes a hook test, not three
component tests.

---

## 6. Completeness scoring takes raw blobs — callers reconstruct inputs

**Files** — `lib/completeness.ts`, `actions/index.ts buildListing`,
`CompletenessPanel.tsx`.

**Problem.** Pure functions extracted for testability, but callers
reconstruct the meta-map by hand each time. Real bugs hide in the calling
glue.

**Solution.** `computeCompleteness(kind, ref, store)` fetches its own
inputs via `EntityMeta` + content store. Pure scorer survives behind it.

**Test impact.** Marginal — pure scorer is already unit-testable. Worth
doing as a downstream cleanup after (2).

---

## Cross-cutting question (separate grilling session)

Can the AI-suggestion stack — `events.ts`, `AiEventLog`, the suggestion
runner, the proposer registry, the auto-apply policy, the
`Origin`/`AsyncLocalStorage` plumbing, the AI Trace middleware — be lifted
out of `packages/content-ai` into a **project-agnostic, entity-agnostic**
package usable by other apps? What stays Spicemixer-shaped (proposers,
diff rules, completeness, EntityKind registry) vs. what's generic
(event log, suppression, fingerprint cache, trace middleware, origin
envelope)? See grilling session log.
