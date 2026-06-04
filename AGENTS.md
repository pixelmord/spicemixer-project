<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Running tests in this repo

Each package owns its own test config. The registry uses Vitest projects (browser-mode for `.test.tsx`, node-mode for `.test.ts`); the website is single-project node-mode; libs each have their own. `vp test` from the monorepo root only sees the root's narrow include set — it misses the registry's browser project and reports spurious "vitest/browser can be imported only inside the Browser Mode" failures. Don't use it.

Canonical commands:

- **Full sweep (use this)**: `vp run -r test` — iterates each package's `test` script with that package's own config. Equivalent to `vp run test` from root, which delegates to `-r test`.
- **Single package**: `cd apps/<pkg> && vp test`.
- **Targeted file**: `vp test <path/to/file.test.ts>` from the owning package's directory.
- **Pre-PR readiness**: `vp run ready` — runs `vp fmt && vp lint && vp run -r test && vp run -r build`.

Do not run `pnpm test`, `npx vitest`, or `vp test` from the monorepo root — the first two bypass Vite+, the last gives misleading results.

## Agent skills

### Issue tracker

GitHub issues at `pixelmord/spicemixer-project` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
