# Entity-level refresh orchestration lives in content-ai-refine, behind a RefreshStrategy seam

Realizing ADR 0008's mandated collapse of the three `run*Refresh` bodies (issue
`#64`), the shared orchestration template — read events → optional fingerprint →
build source context → compose target → `runRefine` → error-check → extract
improvements → apply side effects → assemble — is extracted as a **deep,
portable** `runRefresh` runner. Per-kind variance sits behind a
`RefreshStrategy` seam (an adapter the runner consumes).

## Decision

`runRefresh` and the `RefreshStrategy` interface live in
`@pixelmord/content-ai-refine`, beside the field-level `runRefine` they wrap —
**not** in `content-ai-core` and **not** in `apps/website`.

- The runner never imports a `ContentStore`. The strategy holds all stateful
  context (current data, source context, events, side-effect I/O), so the
  runner is portable: pixelmord-hq reuses it with its own strategies. The "two
  real consumers" rule (ADR 0017) justifies the seam.
- Concrete strategies (`ingredient`, `recipe`, `pairing`) stay in
  `apps/website` — they hold the Spicemixer `ContentStore`, `SidecarEventLog`,
  and the Spicemixer-specific auto-apply targets (pairings → store,
  ingredientLinks + language → meta). `runAiRefresh(kind, …)` is the thin
  app-side dispatcher that selects a strategy.
- The auto-apply **decision** is pure, exported, app-side
  (`planPairingAutoApply`, `planLinkAutoApply`): confidence filter + dedup, no
  I/O. The strategy plans then executes. The pure functions are the test
  surface.

## Why refine, not core

`content-ai-refine` already owns `runRefine` (the field-level LLM-call layer);
entity-level refresh is the natural layer directly above it, and consumers get
one import. `content-ai-core` stays the primitives layer (event log, Origin,
contract types, hashing) — giving it a control-flow runner would blur that
role. Rejected: a separate `content-ai-orchestrate` package — one more thing to
version and wire, for a single runner.

## Consequences

- `content-ai-refine`'s public interface grows: `runRefresh`, `RefreshStrategy`,
  `RawImprovement`. This is a published shape (ADR 0017), so changing it later
  carries a version-compatibility cost.
- `runRefresh` takes an injectable `runField` collaborator (default
  `runRefine`). This keeps the LLM-call dependency an explicit seam rather than
  a hidden module import, and lets consumers (and the app's regression tests)
  substitute it without cross-package module mocking.
- A fingerprint cache hook (`checkCache`) was deliberately **not** added to the
  runner: recipe's cache is an inline early-return in its strategy builder, so
  no consumer needs it. Add it only when one does.

## Cross-references

ADR 0008 — EntityKind seam (the collapse this realizes; issue #64)
ADR 0017 — AI substrate as a separate, published package
ADR 0004 — auto-apply policy and event-log shape
