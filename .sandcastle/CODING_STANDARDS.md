# Coding Standards

The reviewer agent loads this via `@.sandcastle/CODING_STANDARDS.md` and
enforces it on the diff. **Reject changes that violate these rules**, even
if the implementer's tests pass — most of these encode invariants the
implementer cannot see from any single file.

If the diff legitimately needs to break a rule, that's an ADR
(`docs/adr/`) — not an inline override.

## 1. Speak the project's vocabulary

Two glossaries apply: the **domain** (`CONTEXT.md`) and the
**architecture** (the four-term core: module / interface / seam /
adapter — leverage and locality as their consequences).

**Domain terms** — use exactly: **Ingredient · Mixture · Pairing ·
Recipe · Region · Variant · ContentStore · LocalFsStore · GitHubStore**.

**Architecture terms** — use exactly:

- **Module** — anything with an interface and an implementation
  (function, class, package, slice). Not "unit", "component"
  (outside UI), or "service".
- **Interface** — _everything_ a caller must know: types **plus**
  invariants, ordering constraints, error modes, performance
  characteristics. Not "API" or "signature" (those are type-only).
- **Seam** — where an interface lives. Not "boundary" (overloaded
  with DDD's bounded context).
- **Adapter** — a concrete thing satisfying an interface at a seam.

Reject:

- Generic synonyms for domain concepts: `Service`, `Handler`, `Manager`,
  `Repository`, `Client`, `Helper`, `Util` as type/file names for
  domain modules. (UI `Component` is fine for `.tsx`/`.astro`.)
- "Spice mix"/"sauce"/"rub" as a top-level concept — those are
  **kinds** of `Mixture`, not separate entities. `Mixture.kind ∈
{spicemix, sauce, rub, oil, pickle, chutney, marinade}` is closed.
- Re-introducing collapsed relations: `goesWellWith`, `usesBase`,
  `featuredIn`, `variants[]` (computed from `variantOf`). They were
  removed deliberately. Bring them back only with an ADR.
- Conflating `region[]` (closed enum, faceted), `origin[]` (free prose),
  `recipeCuisine` (schema.org cuisine) — they mean different things.
  See CONTEXT.md → Region.
- Architecture-vocabulary drift in code, types, comments, commit
  messages: "the X service", "the auth boundary", "API surface".
  Say module / seam / interface.

## 2. Load-bearing invariants — do not punch through

These are seams. Crossing them in-place breaks Phase 1 → Phase 2.

**ContentStore is the only write path.**

- All persistence in `apps/website/src/` goes through the
  `ContentStore` interface (`apps/website/src/lib/content-store.ts`).
- No direct `fs/promises`, `node:fs`, `@octokit`, or HTTP calls to
  GitHub outside `apps/website/src/lib/stores/`.
- The interface is single-step `put(collection, id, data)`. Don't add
  `stage`/`review`/`approve`/`commitMessage` parameters. Multi-step
  flows live above the interface (PR review for `GitHubStore`),
  not inside it. Per ADR 0006.
- Adding a new `Collection` requires a schema change in
  `content.config.ts` and an updated `ContentStore` type.

**Schema.org payloads stay schema.org.**

- Mixtures and recipes are schema.org `Recipe` JSON-LD on disk
  (ADR 0001). Site-only fields go in a `.meta.json` sidecar.
- Don't add custom fields to the schema.org object. If you need a
  new field, decide: schema.org-canonical (extends Recipe) or
  site-only (sidecar) — write it down.

**Drafts are public-invisible.**

- Any new public query path (list page, search, related-list,
  worldmap aggregation) must filter `meta.draft === true`. The
  admin UI is the only surface that sees drafts.
- Any new authoring path that creates an entity must default to
  `draft: true` on first save (see `quickCreateIngredient`).

**Locale fallback is per-entry.**

- Every entity has a `canonicalLocale` set on first save (ADR 0003).
- New detail/list paths must fall back to `canonicalLocale`
  content with a banner when the requested locale is missing —
  not throw, not 404.
- Source-side edits stamp `translationStaleSince` on translations.
  Don't bypass the translation-sync helper.

**AI auto-apply boundary is conservative.**

- Auto-apply runs only on the lead-curator role (localhost). Any
  AI-origin write that isn't gated by the auto-apply policy must
  emit an `aiEvents` row with `status: "suggested"`, never
  `"applied"`. See ADR 0004.

## 3. Depth over decoration

**Deep modules, not shallow ones.** Depth = leverage at the interface:
a lot of behaviour behind a small interface. Depth produces **leverage**
for callers and **locality** for maintainers.

Explicitly **not**: depth-as-line-ratio. A function padded with five
single-caller internal helpers is not deeper — it's just longer.
Reject "decoration" diffs that move complexity around without
concentrating it.

When reviewing extracted helpers / new abstractions:

- **Deletion test.** Mentally delete the new module and inline its
  body. If complexity vanishes, it was a pass-through — reject it.
  If complexity reappears across N callers, it earns its keep.
- **One adapter = a hypothetical seam. Two adapters = a real seam.**
  A trait/interface with one implementation is usually noise unless
  there's a planned second adapter (`InMemoryStore` is fine: it's
  the test adapter, the second concrete `ContentStore`).
- **Pure-function extractions for testability are a smell.** If the
  bug lives in how the function is called, the test should cover
  the calling path. The interface is the test surface.
- **Don't extract a single-use helper** unless the name is worth a
  glossary slot. `formatDuration` belongs in `duration.ts`;
  `mapAndFilter` does not.
- **The interface is bigger than the type signature.** When a
  module's JSDoc/types document only parameter shapes but not its
  invariants (ordering, error modes, draft handling, locale
  fallback, what it commits to disk vs. just returns), the
  interface is shallow. Push back: either the types capture the
  invariants, or the comment does.

### Adding new I/O — classify the dependency

When the diff introduces a new external call (network, filesystem,
env var, child process, third-party SDK), classify it before
accepting:

| Category                | Example here                                | What's expected                                                                                |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **In-process**          | pure helpers in `lib/`                      | No port. Test through the calling module's interface.                                          |
| **Local-substitutable** | `fs` reads in `LocalFsStore`                | No public port at the entity-helper level — the seam already exists upstream (`ContentStore`). |
| **Remote but owned**    | `GitHubStore` → GitHub API                  | A port exists (`ContentStore`); injected adapter; in-memory adapter for tests.                 |
| **True external**       | OpenAI/Anthropic SDK calls in `content-ai/` | Inject the port; tests use a mock adapter. Don't call the SDK from a domain module.            |

Reject diffs that bypass an existing port (e.g. an admin form
calling `fs.writeFile` directly instead of going through
`ContentStore`).

## 4. Tests go through the seam, not around it

- Tests for `lib/ingredients.ts` use `InMemoryStore`, not
  hand-rolled mocks of individual `ContentStore` methods.
  Pattern in `apps/website/tests/lib/ingredients.test.ts`.
- Don't introduce `vi.mock()` of internal modules. If a module is
  hard to test without mocking it, the interface is wrong — push
  back into the design, don't paper over with mocks.
- New entity helpers in `lib/` need at least one round-trip test
  through `InMemoryStore` (write-then-read).
- Component tests are out of scope for now (no component test
  harness wired up). Don't add one in passing.

### Internal seams stay internal

A module may have **internal seams** (private indirections used by
its own tests or for clarity) and **external seams** (its public
interface). Don't promote an internal seam to the public interface
just so a test can inject something.

Reject:

- New function parameters whose only caller is a test (e.g.
  `saveIngredient(store, input, _now = Date.now)`). Use
  module-level injection or a clock adapter behind the seam.
- Exporting an internal helper purely so a test can call it.
- Default exports of factory functions whose first argument is
  "for testing only".

### Tests describe behaviour, not implementation

- Tests assert on observable outcomes through the public
  interface — what the store contains after a call, what the
  function returns, what error it raises. Not which internal
  helper was called.
- `expect(spy).toHaveBeenCalled()` on an internal helper is a
  red flag: the test is testing past the interface. Either the
  helper is part of the interface (in which case promote it
  honestly) or it isn't (in which case test through the seam).
- Tests should survive internal refactors. If the implementer
  refactors the body of `saveIngredient` and the
  `saveIngredient` tests have to change, the tests were
  shallow.

### Replace, don't layer

When deepening (merging shallow modules into a deeper one):

- Old per-shallow-module unit tests become waste. Delete them
  in the same diff and replace with tests at the new
  interface.
- Don't keep both layers of tests "for safety" — duplicated
  test surfaces drift, and the older layer pins the old shape.

## 5. TypeScript hygiene

- No new `as any`, `as unknown as X`, `@ts-ignore`, or
  `@ts-expect-error`. Existing instances in entity helpers and
  admin forms are tracked debt — don't propagate the pattern.
- `Record<string, unknown>` is acceptable as a meta-patch input
  type (it matches `ContentStore.put`'s shape) but not as a return
  type. If a function returns `Record<string, unknown>`, type it.
- Catalog versions: dependencies live in `pnpm-workspace.yaml`'s
  `catalog:` block. Don't pin a different version inside a
  package's `package.json`.
- Zod: project is on Zod v4 (per `package.json` catalog). Don't
  import from `zod/v3`. Schemas live next to the consumer or in a
  package's `schemas/` folder, not in a global `types.ts`.

## 6. Tooling — Vite+ only

The repo runs on Vite+ (`vp`). Per `CLAUDE.md`:

- Use `vp check`, `vp run -r test`, `vp run -r <task>`, `vp install`,
  `vp build`. Never invoke `pnpm exec vitest`, `npx oxlint`,
  `npm run`, or `tsc` directly.
- **Run tests via `vp run -r test`, not `vp test` from root.** Each
  package owns its own Vitest config (registry uses browser-mode
  for `.test.tsx`, node-mode for `.test.ts`; website is node-only).
  Root `vp test` misses the registry's browser project and reports
  spurious failures. Per-package: `cd apps/<pkg> && vp test`.
  Targeted: `vp test <path>` from the owning package's directory.
- One-off binaries: `vp dlx <pkg>`, never `npx`/`pnpm dlx`.
- Imports come from `vite-plus` / `vite-plus/test`, not `vite` /
  `vitest`. Reject `import { test } from "vitest"`.

## 7. Commits and comments

- Implementer commits start with `RALPH:` (see implement-prompt.md).
  Reviewer commits use conventional prefixes (`refactor:`, `test:`,
  `docs:`) — keeps the merge-phase log scannable.
- Default to **no comments**. Add one only when the WHY is
  non-obvious: an invariant, a workaround, a constraint a future
  reader would otherwise re-litigate. The repo's style: see
  `lib/stores/in-memory.ts` (locale-prefix filter comment) for
  the bar.
- No "what" comments (`// loop over items`, `// return early`).
  Identifiers should already say that.
- No task/issue references in code comments (`// fix for #42`).
  That belongs in the commit message, not in the file.

## 8. File and module shape

- `apps/website/src/lib/<entity>.ts` per primary entity
  (ingredients, mixtures, pairings, recipes). Each exports the
  `Save…` / `Delete…` / `Publish…` helpers that take a
  `ContentStore` first and a typed input second. Match the
  existing pattern; don't introduce a class wrapper.
- Diffs / completeness / merge logic live in their own
  `<entity>-diff.ts` / `completeness.ts` / `recipe-augment.ts`
  files, not as methods on the entity helpers.
- `apps/website/src/components/admin/` for admin React forms;
  `.astro` for public site rendering. Don't render public pages
  in React unless the change includes the SSR plumbing.

## 9. When in doubt

- If a rule above seems wrong for this diff, leave the rule alone
  and surface it in the review comment as a candidate ADR. Don't
  break the rule silently.
- If `CONTEXT.md` and the code disagree, `CONTEXT.md` wins (per its
  own preamble) — but flag the drift so it can be reconciled.
