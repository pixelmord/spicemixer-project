# Rolldown server-entrypoints build crash — diagnosis log

**Date:** 2026-06-04
**Status:** **Resolved** by upgrading build-toolchain dependencies (see Resolution below). Original root cause never positively identified — bypassed by the upgrade.
**Affects:** `apps/website` build on CI (e2e tests can't start the webserver)
**Reproduces:** `pnpm exec astro build` in `apps/website` at HEAD on `fix/ci-build-workspace-packages-before-tests` **before** the dependency upgrade

## Resolution

Bumping the following catalog versions in `pnpm-workspace.yaml` made the build pass:

| Package                          | Before                 | After                  |
| -------------------------------- | ---------------------- | ---------------------- |
| `astro`                          | `^6.2.2`               | `^6.4.3`               |
| `@astrojs/react`                 | `^5.0.4`               | `^5.0.7`               |
| `@types/node`                    | `^24`                  | `^25.9.1`              |
| `@types/react`                   | `^19.2.14`             | `^19.2.16`             |
| `react`/`react-dom`              | `^19.2.5`              | `^19.2.7`              |
| `@sentry/node`                   | `^9.0.0`               | `^10.56.0`             |
| `@ai-hero/sandcastle`            | `^0.5.7`               | `^0.5.12`              |
| `@vitest/coverage-v8`            | `^4.1.5`               | `^4.1.8`               |
| `@typescript/native-preview`     | `7.0.0-dev.20260427.1` | `7.0.0-dev.20260603.1` |
| `vite-plus` (catalog)            | `^0.1.21`              | `^0.1.24`              |
| `@vitejs/plugin-react` (website) | `^5.2.0` (direct)      | `catalog:` (5.2.0)     |

Notably **`@voidzero-dev/vite-plus-core@0.1.24` and `@rolldown/binding-*@1.0.0-rc.17` are unchanged** before/after — the crash is fixed without touching the bundler layer. Suspected fix: **astro 6.2.2 → 6.4.3** (most likely candidate; 6.3.x/6.4.x astro release notes mention vite-plus/rolldown integration fixes). The exact patch hasn't been bisected — if you need to know which specific bump fixed it, bisect that version range.

The diagnosis below is preserved for reference. Most of the partial-fix attempts (re-aliasing `/server`, simplifying `provider.ts`, etc.) turned out to be irrelevant — the bug was in the toolchain, not application code.

---

## Symptom

```
[ERROR] [vite] ✗ Build failed in ~100ms
Cannot convert undefined or null to object
  Location:
    .../@voidzero-dev+vite-plus-core@0.1.24/.../shared/error-BuvQYXuZ.mjs:48:18
  Stack trace:
    at aggregateBindingErrorsIntoJsError (...)
    at #build (...rolldown-build-CgMNHFY3.mjs:3246:34)
    at async Object.build (...)
    at async viteBuild (.../astro/dist/core/build/static-build.js:76:3)
```

Build fails during "Building server entrypoints..." (after "Collecting build info ✓ Completed in ~330ms"). 24 binding errors are returned from rolldown's native layer; all are JsErrors with `message: "Cannot convert undefined or null to object"`, `kind/id/exporter: undefined`, and a stack containing only `process.processTicksAndRejections`. No source location, no plugin name, no module id.

## Versions

- `@voidzero-dev/vite-plus-core@0.1.24`
- `@rolldown/binding-darwin-arm64@1.0.0-rc.17` (transitively bundled via vite-plus-core)
- `astro@6.2.2`
- node 24.16 (works) / node 24.x on CI

## Reproducible bisect outcome

Started from a known-good commit `50ee4bde` (PASS) and bisected against HEAD `298bc8b4` (FAIL).

| Commit                                                                                                     | Build                                         |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `50ee4bde chore: close out relation-taxonomy plan + fix registry test isolation`                           | PASS                                          |
| `9da2d4e3 refactor: clarify substrate layer …`                                                             | PASS                                          |
| `e5e38c8c refactor: tidy imports in runner.ts and NewRecipePage.tsx` (issue-124 parent)                    | SKIP (different error: schema validation)     |
| `b86ce1ad RALPH: complete content-ai lift …`                                                               | SKIP (different error)                        |
| **`c1aaca13 merge: integrate issue-150 (substrate + registry AI blocks) and issue-124 (content-ai lift)`** | **FAIL — first commit with our target error** |
| `298bc8b4` (HEAD)                                                                                          | FAIL                                          |

Both merge parents (`9da2d4e3` and `e5e38c8c` individually) do NOT have the rolldown crash. The merge `c1aaca13` introduces it. So the bug is in the _combination_ of changes from both branches.

### Files touched in the merge resolution

```
apps/website/src/components/admin/PairingForm.tsx       (existing, modified)
apps/website/src/lib/ai/generate-recipe.ts              (existing, modified)
apps/website/src/lib/ai/provider.ts                     (NEW — created in merge)
apps/website/src/lib/ai/runner.ts                       (existing, modified)
apps/website/src/lib/trace/{file,sentry,pubsub}.ts      (existed at 9da2d4e3 but NOT imported by any code)
apps/website/tests/ai-contract.test.ts                  (modified)
apps/website/tests/lib/ai/{generate-recipe,runner}.test.ts (modified)
packages/entity-kind/tsconfig.json                      (modified)
```

### Critical change

The new `apps/website/src/lib/ai/provider.ts` introduced top-level imports of three trace sinks that previously had zero importers:

```ts
import { FileTraceSink } from "@/lib/trace/file.ts"; // imports node:fs/promises
import { SentrySpanSink } from "@/lib/trace/sentry.ts"; // imports @sentry/node transitively
import { PubSubTraceSink } from "@/lib/trace/pubsub.ts"; // imports ../pubsub.ts

const fileSink = new FileTraceSink();
const sentrySink = new SentrySpanSink();
const pubSubSink = new PubSubTraceSink();
```

Before the merge, no module in `apps/website/src` imported the trace sinks — they were dead code. The merge added `provider.ts` which imports all three, pulling the trace sink module graph into Astro's build graph for the first time.

`provider.ts` is reachable from `actions/index.ts` via `generate-recipe.ts`. Astro processes `actions/index.ts` for both server and client (client gets typed proxy stubs). So this brings server-only modules (`node:fs/promises`, `node:async_hooks` via `content-ai-core/server`) into the static prerender graph.

## What we tried (none surfaced root cause)

Patched `node_modules/.pnpm/@voidzero-dev+vite-plus-core@0.1.24_*/dist/rolldown/shared/{error-BuvQYXuZ,bindingify-input-options-D2ORek5s}.mjs` to instrument:

1. `unwrapBindingResult` — confirmed 24 errors per build invocation
2. `normalizeBindingError` — confirmed errors are JsErrors with only `message`/`stack` (truncated)
3. Per-hook wrappers around `transform`, `resolveId`, `load`, `buildStart`, `moduleParsed`, `buildEnd` — **none of them caught the throw**
4. The generic `wrapHandlers` try/catch around ALL hook types — **still no catch**
5. `bindingifyExternal` external-function wrapper — never called with the bug
6. `Error.prepareStackTrace` override to capture construction sites — never fired (rolldown native layer stamps stacks before JS sees them)
7. Patched `TypeError` constructor — never intercepts (V8/native code creates TypeError without going through globalThis.TypeError)

### Where the errors actually originate

- NOT from any user JS plugin hook
- NOT from astro's plugins (which all go through `wrapHandlers`)
- NOT from the `external` resolution callback
- NOT from `customResolver` (astro's tsconfig-alias plugin's customResolver was a red herring — `fs.statSync` with `throwIfNoEntry: false` is safe)
- The errors return packaged as `{ type: "JsError", field0: TypeError }` from rolldown's Rust → JS binding
- Stack only contains `process.processTicksAndRejections` — V8 has discarded the JS frame info by the time the JS Error object reaches `normalizeBindingError`

This strongly suggests the throw happens **inside rolldown's native code** when it tries to inspect a JS object via N-API, hitting `Object.keys`/`Object.entries`/`Object.assign` on something unexpected.

## Partial fix attempts (did not work)

- Removing `@pixelmord/content-ai-core/server` source alias from `astro.config.mjs` → no effect, build still fails
- Reverting `astro.config.mjs` to the working `50ee4bde` state → build still fails (proves astro.config.mjs is NOT the cause)
- Making `provider.ts` trace-sink instantiation lazy (move `new FileTraceSink()` out of module top-level) → no effect
- Removing trace sinks entirely from `provider.ts` → no effect (24 errors persist)

## Two real bugs found and fixed independently

These are unrelated to the rolldown crash but were discovered during investigation. They are committed as their own fix.

1. `apps/website/src/components/admin/NewRecipePage.tsx` — manually constructed `ingested` AiEvents with `as AiEvent` cast, missing required `id` field. Fix: use `createAiEvent()` factory which stamps `id` and `at`.
2. `apps/website/src/content/mixtures/de/griechische-auberginenpaste.meta.json` — committed in `298bc8b4 content(mixtures): add greek eggplant paste (de)` with first event missing `id`. Fix: added `"id": "fe512c2b-934e-4650-8f5b-1adb3ed4fd6c"`.

## Hypotheses worth pursuing next session

1. **rolldown 1.0-rc.17 has a bug** where some specific module pattern (probably involving virtual modules, `astro:actions`, or `node:*` builtins) trips an unhandled N-API conversion. Reproducing on a minimal Astro app and filing upstream is probably the right call.

2. **`pdfjs-dist` / `recipe-ingestion`** transitively pulled into `actions/index.ts`. The recipe-ingestion package was added/wired up via issue-150. Worth checking if removing pdfjs-dist (which has known bundler-issue history) makes the error go away.

3. **`@ai-sdk/openai` v3 / `ai` v5** packages re-exported through `content-ai-core/server`. These packages have heavy use of dynamic imports and conditional exports — potentially confuses rolldown.

4. **vite-plus-core 0.1.20/0.1.21 downgrade test**. These are also present in node_modules via transitive deps. If older versions don't have the broken `aggregateBindingErrorsIntoJsError` (or use older rolldown), pinning may sidestep this. The repo currently uses `vite-plus@catalog:` resolved to 0.1.21. Worth checking what controls the 0.1.24 selection.

## Reproduction recipe

```bash
git checkout fix/ci-build-workspace-packages-before-tests
pnpm install
cd apps/website
pnpm exec astro build   # → 24 binding errors, "Cannot convert undefined or null to object"
```

To instrument:

```bash
# After install, patch the error reporter to log the raw errors before they're aggregated
EDIT_FILE=node_modules/.pnpm/@voidzero-dev+vite-plus-core@0.1.24_@types+node@24.12.2_esbuild@0.27.7_jiti@2.6.1_typescript@6.0.3_yaml@2.9.0/node_modules/@voidzero-dev/vite-plus-core/dist/rolldown/shared/error-BuvQYXuZ.mjs
# Add console.error in unwrapBindingResult to dump container.errors
# Also patch the 24.12.2 AND 25.6.0 hashed copies if both exist
```

## Related links

- Bug summary in CI log: see e2e workflow "Cannot convert undefined or null to object" during `playwright test` webServer startup
- The current branch already has `f52124fb ci: build workspace packages before running tests` which fixed a _different_ CI issue (missing dist files for `entity-kind`/`recipe-ingestion`). That fix is still valid.
- Two valid follow-up commits to land independently: NewRecipePage `createAiEvent` + meta.json `id` backfill.
