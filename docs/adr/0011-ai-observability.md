# AI observability

We have two distinct AI logging surfaces, and they serve different
audiences with different lifetimes. Conflating them — putting trace
data in `aiEvents`, or treating Sentry as the editorial audit — leads
to either bloated content sidecars or vendor-coupled editorial state.
This ADR defines the split.

## Two logs, two purposes

**`AiEventLog`** (ADR 0004, already in place). Editorial decisions,
per-entity, in the meta sidecar. Captures `auto-applied`, `accepted`,
`rejected`, `ingested`. Small, gitable, lives next to content. Pruned
to a soft cap of 100 events. Audience: the editor, the reviewer, future
git archaeology.

**AI Trace** (this ADR). Ops-grade per-call observability. Captures
every AI SDK call: prompt, response, model, finish reason, tokens,
timing, error, and the `Origin` envelope (`surface`, `action`,
`entityRef`, `field`, `userInitiated`, `runId`, `triggeredBy`).
Audience: the developer debugging "why did this extraction go wrong",
the future evaluator replaying old prompts.

Bridge: every `aiEvents.{auto-applied,accepted,rejected,ingested}` entry
carries a `traceId` referencing the trace record that produced it. From
an entity's editorial log you can pull the underlying call; from a trace
you can see whether the editor accepted or rejected the result.

The lifetimes differ deliberately. `aiEvents` is content-coupled and
lives forever in git. AI Trace is ops-coupled and rotates — local JSONL
files by date, gitignored, prunable.

## Storage

**Local JSONL** at `.ai-trace/YYYY-MM-DD.jsonl`, one record per AI SDK
call. Gitignored. The trace store is local to the curator's machine in
Phase 1 — the same locality story as `LocalFsStore`. Phase 2 swaps the
sink behind a `TraceSink` interface; no capability code changes.

We considered three alternatives and rejected them:

- _Per-entity, in `aiEvents[]`_: violates ADR 0004's "keep it simple",
  bloats sidecars, ships full prompts (often copyrighted source text)
  into git. Rejected.
- _External provider as primary store_ (Langfuse/Helicone/etc.): another
  vendor, account, and account-coupling. Pluggable-LLM stance argues
  against it. Rejected as primary.
- _In-memory ring buffer + UI viewer only_: no replay, no eval cache, no
  forensic depth. Rejected.

## Wiring

AI SDK v6 middleware via `wrapLanguageModel`. The provider is wrapped
once in `packages/content-ai/src/provider.ts`; the middleware
intercepts every `wrapGenerate` / `wrapStream` call. Capability code is
unmodified. Coverage is by construction — new capabilities, new
proposers, future translation flows, all auto-traced.

The `Origin` envelope reaches the middleware via `AsyncLocalStorage`,
set once at the Astro action handler boundary. Capabilities don't see
it; signatures stay clean. The middleware reads `als.getStore()` and
emits the trace record.

`runId` is mandatory and groups N AI calls under one editorial
operation. Without it, multi-step flows like `aiRefreshSuggestions`
look like unrelated rows in the trace.

## Sentry: spans without payload bodies

Sentry sits alongside the JSONL store as a **second sink**, not a
replacement. The `tracingMiddleware` fans out to `FileTraceSink`
(JSONL, full payloads) and `SentrySpanSink` (OTel-conventions spans,
scalar attributes only). Both fan-outs receive the same event; the
Sentry sink applies a scrub layer that strips message bodies.

Specifically: Sentry sees `gen_ai.invoke_agent` envelope spans (one per
`runId`) and `gen_ai.request` per-call spans with attributes
`gen_ai.request.model`, `gen_ai.usage.input_tokens`,
`gen_ai.usage.output_tokens`, `gen_ai.finish_reason`, `gen_ai.duration_ms`,
plus our `origin.*` attributes (`surface`, `action`, `capability`,
`entity_kind`, `field`, `user_initiated`).

Sentry **does not see**:

- `gen_ai.request.messages` (the prompt)
- `gen_ai.response.text` (the raw output)
- The source binary, extracted text, or any uploaded file content

The scrub is enforced at the type level: `SentrySpanSink.write(event:
SpanScalars)` accepts a narrowed shape that has no `messages` /
`response.text` fields. Adding payload bodies later requires changing
the type, which surfaces in code review.

We considered the richer slot — Sentry as the only sink, with full
prompt/response in spans (Sentry's default for AI Agent Monitoring) —
and rejected it for two reasons:

1. _Copyright._ The source PDFs we ingest are often copyrighted recipe
   content. Shipping verbatim text to a vendor is a posture we don't
   want to take, especially because Phase 2 will host community uploads
   we don't control.
2. _Eval ergonomics._ Evals replay prompts. Pulling them back out of
   Sentry is poor UX vs. grepping a local JSONL.

If you adopt Sentry's auto AI SDK integration, it _will_ ship message
bodies by default. We use a custom middleware specifically to keep
control over what enters span attributes.

## Sampling and budget

Free-tier Sentry has a finite span budget. Naively sending every call
will exhaust it during prompt-tuning sprints. We use a conditional
`tracesSampler`:

- **100% if errored or `finishReason !== "stop"`.** The interesting
  calls are the failing ones — never sample those.
- **~25% of successful calls.** Enough volume for performance dashboards;
  not enough to blow the budget.

The full record always lands in the local JSONL — sampling only affects
what reaches Sentry. Errors hit Sentry's separate error budget (cheap,
rare).

## Escape hatch: OTel format is the portability story

Because we emit standard OTel `gen_ai.*` semantic conventions, switching
backends is a sink-swap, not a rewrite:

- `FileTraceSink` (default, always on) → JSONL on disk.
- `SentrySpanSink` (opt-in via env) → SaaS Sentry.
- `OtelHttpSink` (future) → any OTel-compatible backend (Grafana Cloud,
  self-hosted Jaeger/Tempo, OTel collector).

Self-hosted Sentry was considered as the budget escape and rejected for
Phase 1: ops weight is wildly disproportionate (Postgres + ClickHouse +
Kafka + Redis + workers, ~4–8 GB RAM, version-upgrade exposure). If the
SaaS budget proves insufficient, swapping `SentrySpanSink` for an OTel
collector writing to local SQLite is the cheap path; self-hosted Sentry
is the heavy path and only justified if Sentry's specific UI is the
binding requirement.

## Consequences

- `packages/content-ai/src/provider.ts` wraps the model in
  `wrapLanguageModel({ middleware: tracingMiddleware(sinks) })`.
- A new module `packages/content-ai/src/trace/` owns: middleware,
  `Origin` type, `AsyncLocalStorage` setup, `TraceSink` interface,
  `FileTraceSink`, `SentrySpanSink`, scrub layer.
- Astro action handlers wrap themselves in `Sentry.startSpan({ op:
"gen_ai.invoke_agent" })` and set `Origin` in `AsyncLocalStorage` at
  the same boundary.
- `aiEvents` schema gains optional `traceId` on every event. Existing
  events without a `traceId` are tolerated (pre-trace history).
- `.ai-trace/` added to repo `.gitignore`.
- `@sentry/node` added as a dependency of `apps/website`. Initialized
  with `tracesSampler` per the sampling stance above. `recordInputs:
false`, `recordOutputs: false` to disable Sentry's auto AI integration
  payload capture.
- Free-tier Sentry account; upgrade or swap sink only with evidence of
  budget exhaustion.

## Open follow-ons

- The two long flows that justify SSE progress (`aiRefreshSuggestions`,
  `aiGenerateRecipe`) tap the same in-memory pub/sub the trace stream
  produces — same events, two consumers. Implementation detail in the
  observability plan, not in this ADR.
- Phase 2 community contributions trigger `triggeredBy: "system"` —
  already accommodated by the `Origin` shape; no further ADR change
  needed.

## Reference

Decided in the 2026-05-08 grilling session. Compounds with ADR 0004
(editorial event log) and ADR 0006 (persistence adapter). Plan and
sequencing live in `docs/plans/ai-observability-and-evals.md`.
