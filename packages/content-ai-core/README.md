# @pixelmord/content-ai-core

The shared substrate for the content-ai packages: contract vocabulary, the AI event log + suppression, fingerprinting, the provider factory with tracing, and presentation helpers. The runner packages (`content-ai-ingest`, `content-ai-refine`) depend on it; it owns the types they re-export (ADR 0017).

> **Using the substrate?** See the [consumer guides](../../docs/content-ai/index.html) and the [generated API reference](../../docs/content-ai/index.html). This README is for people working **on** the package.

## Module map

| File                               | Responsibility                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `contract.ts`                      | `AiContract` / `FieldConfig` / `Preset` / `PromptContext` / policies — the vocabulary consumers author against. |
| `events.ts`                        | `AiEvent`, `AiEventLog`, stamping, pruning. Append-only history per `EntityRef`.                                |
| `suppression.ts`                   | Filter suggestions against `rejected` events; build rejected-context prompt blocks.                             |
| `suggestions.ts`                   | `FieldSuggestion`, `AppliedSuggestion`, `FieldWritePolicy`, `TraceSummary`.                                     |
| `hash.ts`                          | `fingerprintHash` (short, for dedup/suppression) and `hashContent` (full, for staleness diffing).               |
| `translation.ts` / `field-diff.ts` | `TranslationBehavior`, `resolveTranslation`, `classifyRefreshKind`.                                             |
| `provider.ts`                      | `createProvider`, `resolveConfig`, `AiConfig`. **Server-only consumers** import via `/server`.                  |
| `origin.ts` / `trace.ts`           | `Origin` (async-local provenance), `tracingMiddleware`, `TraceSink`. **Server-only** (`node:async_hooks`).      |
| `logger.ts` / `errors.ts`          | Pino-compatible `Logger` interface; typed `AiError`.                                                            |
| `presentation/`                    | Display helpers (`summarizeSuggestion`, `formatConfidence`).                                                    |
| `testing/`                         | `InMemoryAiEventLog`, `InMemoryTraceSink`, the synthesizing mock model.                                         |

### Entry points

The surface is split so browser bundles never pull in Node-only code:

- `.` — isomorphic: types, events, suppression, hashing, translation, logger, errors.
- `./server` — `node:async_hooks`: Origin/ALS, tracing, `createProvider`.
- `./testing` — in-memory log + trace sink + mock model.
- `./presentation` — isomorphic display helpers.

Keep this boundary intact: anything touching `node:async_hooks` or `process.env` belongs behind `/server` or `/testing`, never in the `.` barrel.

## Develop

```sh
vp install          # after pulling
vp pack             # build (tsdown → dist), declaration files included
vp pack --watch     # dev
vp test             # package tests
vp check            # format + lint + typecheck
```

## Invariants

- **One definition, no copies.** Core owns the shared types; runners re-export. The `bulk`-flag bug came from a divergent inline copy — don't reintroduce one.
- **Never-prune events.** `rejected` and `ingested` events must stay prunable-exempt (ADR 0004): the former is the suppression record, the latter source attribution.
- **Append serialises per `EntityRef`.** `AiEventLog.append` implementations must not interleave read-prune-write cycles for the same ref. `InMemoryAiEventLog` shows the promise-chain pattern.
- **Fingerprint stability.** `normalizePayload` defines what counts as "the same" suggestion. Changing it invalidates existing suppression history — treat as a breaking change.
- **No I/O in the substrate.** Core provides types and pure helpers; reads/writes live in the consumer.

## Extending

- **A new shared type** → add it here and re-export from the relevant runner's `types.ts`; never define it in a runner.
- **A new trace destination** → implement `TraceSink`; wire via `createProvider({ sinks })`, not by hand.
- **A new field policy / translation mode** → extend the union in `suggestions.ts` / `contract.ts` and handle it in both runners.

## Release

Published to GitHub Packages (`@pixelmord` scope, restricted). `prepublishOnly` runs the build. Version with changesets; bump runners together when the shared type surface changes.
