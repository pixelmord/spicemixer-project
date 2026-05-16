# AI substrate is a separate package, not Spicemixer code

Two real consumers of the AI content-suggestion substrate now exist: Spicemixer
and pixelmord-hq. The "two real adapters = real seam" test passes; lifting the
substrate into a publishable package is warranted.

## Decision

Extract the AI substrate types and runtime primitives into
`@pixelmord/content-ai-core` (package `packages/content-ai-core` within the
Spicemixer monorepo, workspace-linked until cross-repo distribution lands in
PRD 8.4). Spicemixer continues to consume it as a workspace package; pixelmord-hq
adopts it in parallel via the same workspace symlink mechanism.

The substrate covers everything both consumers share verbatim:

| Export group              | Contents                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Contract types            | `AiContract<S, Source>`, `FieldConfig<S, Source>`, `Preset<S, Source>`, `AutoApplyPolicy`, `PromptContext`      |
| Write + suggestion shapes | `FieldWritePolicy`, `FieldSuggestion` (discriminated `single` \| `choice`), `AppliedSuggestion`, `TraceSummary` |
| Event log                 | `AiEvent` (schema + type), `AiEventLog` interface, `EntityRef`, `isPrunable`, `planPrune`                       |
| Origin / ALS              | `Origin`, `originContext` (AsyncLocalStorage), `withOrigin`, `wrapWithOrigin`                                   |
| Trace                     | `TraceSink` interface, `TraceEvent`                                                                             |
| Hashing                   | `normalizePayload`, `fingerprintHash` (first-12-hex SHA-256)                                                    |
| Provider                  | `AiConfig`, `createProvider`, `PROVIDER_OPTIONS`                                                                |
| Suppression               | `isSuppressed`, `filterSuggestions`, `buildRejectedContext`                                                     |
| Translation config        | `TranslationBehavior` (staged from PRD 10; wired in PRD 10 runner)                                              |
| Presentation sub-export   | `summarizeSuggestion`, `formatConfidence`, `groupSuggestionsByField`                                            |
| Testing utilities         | `InMemoryAiEventLog`, `InMemoryTraceSink`                                                                       |

Spicemixer-specific adapters (`SidecarEventLog`, `FileTraceSink`,
`SentrySpanSink`, `LocalSourceStore`) stay in `apps/website/` and
`packages/content-ai/`. pixelmord-hq will write its own `ConvexEventLog` and
`ConvexTraceSink` implementing the same interfaces.

## Motivation

Without the lift both consumers copy-paste the AI contract type, runners,
suppression rules, `Origin` envelope, ALS plumbing, AI SDK provider wrapping,
fingerprint hashing, and trace middleware. That violates the "two real adapters
= real seam" rule established in ADR 0006.

The lift is hard to reverse once pixelmord-hq has published imports. It is
surprising without context (the Spicemixer repo now ships code consumed by a
different project). Documenting the decision here meets the ADR threshold.

The trade-off accepted: the publishable shape imposes a version-compatibility
constraint that a pure monorepo wouldn't. This is acceptable because the two
consumers are owned by the same developer and the package is workspace-only
until cross-repo distribution (PRD 8.4) is ready.

## Locked invariants carried forward

- **Schema stays a pure validator.** AI metadata is separate from Zod schemas,
  never embedded via `.meta()`. Non-AI callers don't carry prompt strings in
  their bundle. (See also ADR 0013.)
- **`rejected` and `ingested` events are never prunable.** `isPrunable` returns
  `false` for both. Adapters with size pressure call `planPrune` before write;
  `rejected` entries form the suppression history, `ingested` entries are the
  source-attribution record. (ADR 0004.)
- **`AiEventLog.append` is serialisable per `entityRef`.** Documented in the
  interface JSDoc. Spicemixer's file-based adapter needs per-entity locking;
  Convex's needs none — the interface contract holds regardless.
- **Field config is per-contract, not per-call.** Per-call args are `userPrompt`
  and `preset` id only. (ADR 0008.)
- **Source context is typed per-contract** via the `Source` type parameter.
  Refine contracts use `never`. (Ingest runner in PRD 8.3.)

## Cross-references

ADR 0004 — auto-apply event log shape and rejection invariant
ADR 0006 — persistence adapter seam
ADR 0008 — EntityKind seam and per-contract field configs
ADR 0011 — AI observability (TraceSummary vs full trace records)
ADR 0012 — source artifact storage
ADR 0013 — meta sidecar carries workflow state

See also: `docs/plans/2026-05-15-content-ai-package-lift.md` (strategic plan),
PRD #80 (package lift), PRD #92 (core package, this issue).
