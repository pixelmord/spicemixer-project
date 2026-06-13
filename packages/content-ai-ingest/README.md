# @pixelmord/content-ai-ingest

Source-driven AI fill. One runner — `runFill` — turns an external source (PDF, image, text, URL, or a sibling-locale entity) into per-field suggestions in a single structured model call.

> **Using `runFill`?** See the [ingest guide](../../docs/content-ai/ingest.html) and the [API reference](../../docs/content-ai/index.html). This README is for people working **on** the package.

## Module map

| File          | Responsibility                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `run-fill.ts` | `runFill` + the write-policy resolution, field-skip logic, and the `MERGE_INSTRUCTION` for sibling-locale merges.       |
| `types.ts`    | `IngestContract`, `MessageSet`, `SiblingLocaleSource`, `RunFillParams`/`RunFillResult`. Re-exports core's shared types. |
| `hash.ts`     | Thin re-export of core's fingerprinting (kept local to avoid a deep import).                                            |

## Develop

```sh
vp install
vp pack            # build
vp test            # package tests
vp check           # format + lint + typecheck
```

## Control flow

`runFill` is the source-driven counterpart to `content-ai-refine`'s prompt-driven `runRefine`:

1. `contract.buildMessages(source)` → a `MessageSet` (plain prompt or multimodal parts).
2. `createProvider(config, { sinks })` → one `generateText` call with structured output over `contract.schema`.
3. Each extracted field is split into `autoApplied` vs `suggestions` by its resolved write policy.
4. Returns an `ingestedEvent` for the **caller** to persist — the runner writes nothing.

## Invariants

- **Side-effect free.** No store or event-log writes. The `ingestedEvent` is returned, not appended.
- **Write-policy precedence** (in `resolvePolicy`): per-field `fieldPolicies` → call-level `writePolicy` → contract field policy → default (`fill-if-empty` when current data exists, else `replace`). Preserve this order — consumers depend on it.
- **Translation goes through here, not refine.** `runRefine` rejects `SiblingLocaleSource`; sibling-locale fills (with optional `MERGE_INSTRUCTION`) are `runFill`'s job.
- **Shared types come from core.** Don't inline `FieldWritePolicy`, `EntityRef`, etc.; re-export them from `types.ts` (ADR 0017).

## Extending

- **A new source kind** → handle it in the consumer's `buildMessages`; the runner is source-agnostic by design.
- **New result data** → extend `RunFillResult` and document it in the ingest guide.

## Release

Published to GitHub Packages (`@pixelmord` scope, restricted). Depends on `@pixelmord/content-ai-core` (`workspace:*`); bump alongside core when the shared type surface changes.
