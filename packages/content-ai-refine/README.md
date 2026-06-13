# @pixelmord/content-ai-refine

Prompt-driven AI refinement. `runRefine` generates or improves entity fields from existing data and prompts (one model call per field); `runRefresh` orchestrates a full or per-field refresh on top of it, writing results back through a per-kind strategy the consumer supplies.

> **Using these runners?** See the [refine guide](../../docs/content-ai/refine.html) and the [API reference](../../docs/content-ai/index.html). This README is for people working **on** the package.

## Module map

| File             | Responsibility                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `run-refine.ts`  | `runRefine` — the per-field funnel: write-policy skip → schema unwrap → prompt → LLM → fingerprint → suppression → auto-apply decision. |
| `run-refresh.ts` | `runRefresh` + `RefreshStrategy` — orchestration over `runRefine`, with the `assemble` seam where consumer I/O lives (ADR 0020).        |
| `types.ts`       | `RunRefineParams`/`RunRefineResult`, `AiEvent` (minimal), `FieldRunError`. Re-exports core's contract types.                            |
| `hash.ts`        | Thin re-export of core's fingerprinting.                                                                                                |

## Develop

```sh
vp install
vp pack            # build
vp test            # package tests
vp check           # format + lint + typecheck
```

## Control flow

- **`runRefine`** runs target fields concurrently. Per field, anywhere it drops out the field is simply absent from the result. The funnel: `shouldSkipByPolicy` → resolve output schema (`requireValueSchema` strips optional/nullable/default so the model must return a value) → `systemPrompt(ctx)` (empty ⇒ gated off) → `generateText` for `{ value, confidence }` → `fingerprintHash` → suppression check → `resolveAutoApply` (confidence ≥ threshold ⇒ `autoApplied`, else `suggestions`).
- **`runRefresh`** computes the target (full run = missing `baseFields` + every `bulk` field from the contract; per-field = exactly `baseFields`), drives the injectable `runField` (default `runRefine`), gates on errors, extracts `rawImprovements`, then delegates to `strategy.assemble`.

## Invariants

- **The runner never touches a store or event log.** All side effects — auto-apply writes, event appends, app-specific filtering — happen in the consumer's `assemble`. This is what keeps the runner portable across consumers (ADR 0017/0020). Don't inline I/O into `run-refresh.ts`.
- **`runField` stays an explicit seam.** It's a parameter (defaulting to `runRefine`), not a hidden module import — so tests can inject a double without an LLM.
- **The contract decides the bulk target.** A full refresh derives its fields from `bulk: true` flags, not a hand-maintained list. Preconditions belong in a field's `systemPrompt` (return `""` to gate off), not in `bulk`.
- **Confidence is an uncalibrated self-report**, not a logprob (high=1.0, medium=0.5, low=0.0). See the in-progress confidence work — don't treat it as a calibrated score.
- **`runRefine` rejects sibling-locale sources.** Translation is `content-ai-ingest`'s `runFill`.

## Extending

- **A new orchestration shape** → add a `RefreshStrategy` field or a new `assemble` arg; keep the runner I/O-free.
- **A new per-field behavior** → extend `FieldConfig` in core, then handle it in the funnel.

## Release

Published to GitHub Packages (`@pixelmord` scope, restricted). Depends on `@pixelmord/content-ai-core` (`workspace:*`); bump alongside core when the shared type surface changes.
