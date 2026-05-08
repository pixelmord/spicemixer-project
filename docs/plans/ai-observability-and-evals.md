# Plan: AI observability and evals

> Sequencing plan for the work specified in ADR 0011 (AI observability)
> and ADR 0012 (source artifact storage), plus the narrowly-scoped first
> eval. Decisions are locked in the ADRs; this file is the implementation
> path.

## Goals (recap)

Three outcomes, in priority order:

1. **Post-mortem debugging.** Reconstruct any AI call after the fact —
   prompt, response, model, finish reason, error, origin. The current
   gap is real: zero `console.*` in `packages/content-ai/src`, the UI
   debug toggle returns telemetry per call but nothing persists. (A)
2. **Live progress feedback in the UI.** The editor sees more than
   `Working…` while AI runs — at minimum a capability label, ideally
   real progress on the two long flows (`aiRefreshSuggestions`,
   `aiGenerateRecipe`). (B)
3. **Eval framework.** Long-term quality signal for `aiExtractRecipe`,
   bootstrapped from forward-captured ingestions. Foundation for
   eventually evaluating proposers, translations, and OCR-strategy
   comparisons. (C)

## Sequencing

The dependency graph: A → C (because A's trace JSONL is C's cache and
dataset), A → B(c) (because B's progress feed reuses A's middleware
events). B(a) is independent. So:

- **Milestone 1 — Tracing skeleton (A).** No Sentry, no UI changes;
  just the JSONL.
- **Milestone 2 — Source store (ADR 0012).** Land the three-artifact
  pipeline behind a `SourceStore` interface; wire ingest action
  handlers to write binary + text + structured.
- **Milestone 3 — Sentry + sampling.** Second sink, scrub layer,
  conditional sampler, OTel `gen_ai.*` attributes.
- **Milestone 4 — UI progress (B(a) labels) + SSE for the two long
  flows (B(c)).**
- **Milestone 5 — First eval (`aiExtractRecipe`).** evalite at
  `packages/content-ai/evals/`, scorers, JSONL-backed cache.
- **Milestone 6 — Forward-capture promotion.** CLI promoting accepted
  trace records into eval gold.

Each milestone is independently mergeable. Don't bundle.

## Milestone 1 — Tracing skeleton

**Module**: new `packages/content-ai/src/trace/`.

```
trace/
├── index.ts             ← public exports (TraceSink, Origin, runWithOrigin)
├── origin.ts            ← Origin type + AsyncLocalStorage helpers
├── middleware.ts        ← LanguageModelV3Middleware impl
├── sinks/
│   ├── file.ts          ← FileTraceSink (JSONL daily file)
│   └── types.ts         ← TraceSink interface
└── ids.ts               ← runId generator (ulid or nanoid)
```

**Steps**:

1. Define `Origin` type per `CONTEXT.md` "Origin" entry. Mandatory
   `runId`; `triggeredBy: "editor" | "system"` from day one.
2. `runWithOrigin(origin, fn)` wraps `AsyncLocalStorage.run`.
3. `tracingMiddleware(sinks: TraceSink[])` returns a
   `LanguageModelV3Middleware` with `wrapGenerate` (and `wrapStream`
   later) that reads the ambient `Origin`, records a trace entry, fans
   out to every sink.
4. `FileTraceSink` writes JSONL to `.ai-trace/YYYY-MM-DD.jsonl`. One
   line per call. Append-only. Lazily creates the directory.
5. Wire the middleware into `provider.ts`:
   ```ts
   return wrapLanguageModel({ model: openai(config.model), middleware });
   ```
6. Astro action handlers wrap themselves in `runWithOrigin({ surface,
action, ..., runId: ulid() }, async () => { ... })`. Helper:
   `withOrigin(origin)(handler)` to keep handler bodies clean.
7. `.ai-trace/` added to root `.gitignore`.

**Done when**: triggering any AI action from the admin UI produces a
JSONL line with full prompt + response + origin envelope; tail-following
the file shows live activity.

**Test**: a single Vitest test that runs `aiExtractRecipe` against a
mocked provider, asserts the JSONL line shape. Existing capability
tests should continue to pass unchanged (middleware is a no-op when no
ambient Origin is set).

## Milestone 2 — Source store (ADR 0012)

**Module**: new `packages/content-ai/src/source-store/`.

```
source-store/
├── index.ts             ← public SourceStore interface
├── local.ts             ← LocalSourceStore impl
├── ids.ts               ← sha256 helper
└── types.ts             ← Artifact metadata schemas
```

**Steps**:

1. `SourceStore` interface:
   ```ts
   interface SourceStore {
     putBinary(bytes: Uint8Array, meta: BinaryMeta): Promise<{ binaryHash: string }>;
     putText(
       binaryHash: string,
       strategy: string,
       version: string,
       text: string,
       meta: TextMeta,
     ): Promise<void>;
     putStructured(
       binaryHash: string,
       traceId: string,
       data: unknown,
       meta: StructuredMeta,
     ): Promise<void>;
     readBinary(binaryHash: string): Promise<Uint8Array | null>;
     listForBinary(binaryHash: string): Promise<{ texts: string[]; structured: string[] }>;
   }
   ```
2. `LocalSourceStore` implementation against `data/sources/<hash>/`.
   Writes binary + per-artifact `*.meta.json` files. Hash via
   `@noble/hashes` (already a dep).
3. `data/sources/` added to root `.gitignore`.
4. Wire into ingest action handlers (`aiExtractRecipe`,
   `aiExtractIngredient`, `aiExtractPairing`, `aiMergeRecipe` URL
   branch). On success: write binary, write text artifact, write
   structured artifact keyed by current `traceId` (from Milestone 1's
   `Origin`).
5. Migrate `aiEvents.ingested.source: string` → structured descriptor.
   Keep tolerant read for old shape (`string` → `{ kind: "url", url }`).
6. Admin "View source" affordance: a route `GET
/admin/source/:binaryHash` that streams the binary back from
   `LocalSourceStore`.

**Done when**: ingesting a new recipe writes three artifacts under
`data/sources/<hash>/`; the meta sidecar carries the new structured
`ingested.source` descriptor; the admin UI shows a "View source" link
that opens the original.

**Test**: integration test that runs an extract end-to-end (mocked
model), inspects `data/sources/` afterward.

## Milestone 3 — Sentry + sampling

**Steps**:

1. `apps/website/package.json` adds `@sentry/node`. Initialize in a new
   `src/lib/sentry.ts` with:
   - `dsn: process.env.SENTRY_DSN` (skip init when unset for local dev
     without Sentry account).
   - `tracesSampler` per ADR 0011: 100% on error/`finishReason !==
"stop"`, ~25% otherwise. Read `outcome` attribute set on the root
     `gen_ai.invoke_agent` span at finish.
   - **No** AI auto-integration. Disable any `recordInputs` /
     `recordOutputs` flags Sentry's SDK exposes.
2. New `SentrySpanSink` in `trace/sinks/sentry.ts`. Emits OTel
   `gen_ai.request` spans with **scalar attributes only** — type
   `SpanScalars` excludes `messages` and `response.text` fields, so the
   sink can't accidentally ship them.
3. Action handlers wrap their body in `Sentry.startSpan({ op:
"gen_ai.invoke_agent", attributes: { runId, surface, action } })`
   so the per-call spans become children. Set `outcome: "ok" | "error"`
   on the root span at finish for the sampler to read.
4. Provider wiring: `tracingMiddleware([fileSink, sentrySink])` — both
   sinks receive every event; only `sentrySink` is rate-limited by the
   sampler.

**Done when**: triggering an AI call shows up in Sentry as a span tree
(`gen_ai.invoke_agent` parent + `gen_ai.request` children) with model,
tokens, duration, finish reason, origin attributes — and **no** prompt
or response text. Errors page automatically.

**Test**: unit test that asserts `SentrySpanSink.write` rejects an
event carrying `messages` or `response.text` (scrub layer enforcement).

## Milestone 4 — UI progress

### Part (a) — capability labels (global)

Replace the generic `Working…` spinner copy with capability-aware copy
in `AiComposeForm` and `AiAssistPanel`:

- `extract-recipe` → `Extracting recipe…`
- `aiTranslateRecipe` → `Translating recipe…`
- `aiRefreshSuggestions` → `Refreshing suggestions…`
- ... etc.

A small `CapabilityLabel` component keyed off the action name. ~30 min
of work. Ship as a tiny PR independent of (c).

### Part (c) — SSE for `aiRefreshSuggestions` and `aiGenerateRecipe`

Two new endpoints — server actions don't stream, so these graduate
from `actions.aiX` to streaming routes:

- `POST /api/ai/refresh-suggestions/stream` (SSE)
- `POST /api/ai/generate-recipe/stream` (SSE — uses AI SDK `streamObject`)

Architecture:

1. New `trace/pubsub.ts`: in-memory pub/sub keyed by `runId`. Each
   middleware event also publishes to the channel for that runId.
2. The SSE endpoint generates a `runId`, opens an SSE channel
   subscribed to that runId, then drives the work — middleware events
   stream out as they happen.
3. UI: replace the `actions.X(...)` call with a `fetch` + readable
   stream consumer. Display step labels (`Calling extract-recipe…`,
   `Validating schema…`, `Calling propose-tags (3/5)…`) as they arrive.
4. For `aiGenerateRecipe`: switch the underlying capability from
   `generateObject` to `streamObject` so the recipe materializes
   progressively in the UI.

**Done when**: clicking "Refresh suggestions" on a recipe shows live
proposer-by-proposer progress; clicking "Generate recipe" streams the
recipe content as it's produced.

## Milestone 5 — First eval (`aiExtractRecipe`)

**Module**: new `packages/content-ai/evals/`.

```
evals/
├── package.json         ← evalite as devDependency
├── extract-recipe.eval.ts
├── scorers/
│   ├── schema-valid.ts
│   ├── required-fields.ts
│   ├── ingredient-recall.ts
│   ├── instruction-order.ts
│   └── description-faithful.ts   (LLM-as-judge, opt-in)
├── cache/
│   └── jsonl-cache.ts   ← reads A's trace JSONL by input hash
└── fixtures/
    └── synthetic-seed.ts ← 2 hand-written cases for harness smoke
```

**Steps**:

1. Add evalite as devDependency. Pin compatible version.
2. `extract-recipe.eval.ts` skeleton:
   ```ts
   evalite("aiExtractRecipe", {
     data: () => loadCases(), // reads source store + accepted aiEvents
     task: async (input) => extractWithCache(input),
     scorers: [
       schemaValid,
       requiredFieldsPresent,
       ingredientRecall,
       instructionOrderPreserved,
       descriptionFaithful,
     ],
   });
   ```
3. `extractWithCache`: hashes the input, checks the JSONL trace store
   (Milestone 1) for a matching entry; on hit, returns the cached
   output; on miss, calls `aiExtractRecipe` for real.
4. Scorers per ADR-0011-adjacent design discussion:
   - `schemaValid`: binary, `RecipeExtract.safeParse(output).success`.
   - `requiredFieldsPresent`: numeric, fraction of `{name,
recipeIngredient, recipeInstructions, recipeYield}` non-empty.
   - `ingredientRecall`: numeric, normalized substring/token-overlap
     match (≥0.7) per expected ingredient. Reports recall + the
     unrecovered list.
   - `instructionOrderPreserved`: binary, LCS over normalized step
     text ≥ 80% of expected length.
   - `descriptionFaithful`: LLM-as-judge, runs only when
     `AI_JUDGE_BASE_URL` + `AI_JUDGE_API_KEY` + `AI_JUDGE_MODEL` are
     set. Uses a different model than the system-under-test to avoid
     same-model bias.
5. Two synthetic schema-smoke fixtures so the harness wires up before
   real cases exist. Tag `synthetic`. Plan: evict once 10 real cases
   are captured.
6. Run cadence: on-demand only via `pnpm -F content-ai eval` (or
   `pnpm -F content-ai eval:ui` for evalite's dev server). No CI gate
   in Phase 1.

**v6 incompatibility workaround**: `wrapAISDKModel` is not used —
evalite (v0.19) pins `@ai-sdk/provider@^2`, we're on v3. Capabilities
are called directly inside `task`. Caching is provided by the
JSONL-backed wrapper, not evalite's built-in. Tracing is provided by
ADR 0011's middleware. Revisit when evalite catches up to v6.

**Done when**: `pnpm -F content-ai eval:ui` opens evalite's UI and
runs the two synthetic cases through all five scorers; the eval suite
exits non-zero if any scorer fails on any case.

## Milestone 6 — Forward-capture promotion

**Steps**:

1. `aiEvents` schema gains `traceId?: string` on every event type.
   Action handlers stamp it on every event they emit.
2. New CLI `pnpm -F content-ai evals:capture`:
   - Reads all meta sidecars across content collections.
   - Filters `aiEvents` to `type === "accepted"` AND `capability ===
"extract-recipe"` AND `traceId` present.
   - For each match, verifies the source store has the binary +
     structured artifact for that `traceId`.
   - Adds the case to the eval dataset (the eval reads directly from
     the source store + accepted events; "promote" is a metadata
     write, not a copy).
3. Evict the synthetic seed cases once ≥10 real cases are captured.

**Done when**: an editor can run a normal extract, accept the result,
then run `evals:capture` and see that recipe show up in
`evalite --watch` as a new test case automatically.

## Risks and mitigations

- **AsyncLocalStorage in serverless**: only relevant for Phase 2
  hosting. Phase 1 is local Astro server actions — single Node process,
  ALS works. Reassess when GitHubStore + hosted admin lands.
- **JSONL grows unbounded**: rotation by date already handles this; a
  small "trim files older than N days" cron is enough for Phase 1.
  Don't pre-build a retention manager.
- **Sentry budget exhaustion during prompt-tuning sprints**: the
  conditional sampler bounds spans; errors hit the separate error
  budget. If still exhausting, swap `SentrySpanSink` for an OTel
  collector writing local SQLite — sink change, no code change.
- **Eval drift**: scorer thresholds (e.g. `ingredientRecall` ≥ 0.7)
  may be wrong. Plan: review after first 10 real cases land; adjust.

## Out of scope

- Evaluating proposers (tags/links/improvements/pairings/slug). Defer
  until structural-extract eval is stable.
- Evaluating `aiGenerateRecipe`. Pure judge-based, expensive, lowest
  signal. Defer.
- Evaluating translations. Has natural ground truth via paired locale
  folders, but requires its own scorer design. Defer to a follow-on
  plan once the evalite harness has proved itself.
- Public-facing source attribution (`isBasedOn`). Editorial flow, not
  observability.
- Self-hosted Sentry. Defer until SaaS budget proves insufficient.

## References

- ADR 0011 — AI observability
- ADR 0012 — Source artifact storage
- ADR 0004 — AI auto-apply boundary (existing `aiEvents`)
- ADR 0006 — Persistence adapter (the `LocalFsStore`/`GitHubStore`
  pattern that `LocalSourceStore`/`S3SourceStore` mirrors)
- evalite — https://www.evalite.dev/
- AI SDK v6 middleware —
  https://github.com/vercel/ai/blob/ai@6.0.0-beta.128/content/docs/03-ai-sdk-core/40-middleware.mdx
- Sentry AI Agent Monitoring —
  https://docs.sentry.io/platforms/javascript/guides/node/ai-agent-monitoring
