# Cross-repo distribution via GitHub Packages + changesets

The `content-ai-*` packages (core / refine / ingest) are now ready for a second
consumer — pixelmord-hq. They need a distribution mechanism that both the
Spicemixer monorepo and pixelmord-hq CI can install deterministically.

## Decision

Distribute `@pixelmord/content-ai-core`, `@pixelmord/content-ai-refine`, and
`@pixelmord/content-ai-ingest` via the **GitHub Packages private npm registry**
at `https://npm.pkg.github.com`, scoped to `@pixelmord`.

Release management uses **`changesets` in fixed mode** — all three packages
always bump together. Publish-on-merge-to-main via the `changesets/action`
GitHub Action. Starting version `0.1.0` (pre-1.0, no deprecation contract owed).

Consumer authentication uses a **fine-grained PAT with `read:packages` scope**
stored as `GH_PACKAGES_TOKEN` in each consuming repo's secrets and in each
developer's `~/.npmrc`.

## Motivation

The two-consumer test passes (ADR 0017). Workspace symlinks (`link:../../`) were
rejected because they leak absolute paths into lockfiles, break CI in
pixelmord-hq unless both repos are checked out side-by-side, and cannot pin
versions. Public npm is overkill — GH Packages is free, already authenticated
against the org, and private. Per-package GH Packages repo linking was rejected
as a manual UI step per package with no mechanical advantage over PAT auth.

## Locked invariants

- **Fixed versioning.** All three packages share one version tag. A semver bump
  to any one package bumps all three. Consumers always install a coherent set.
- **`publishConfig` in each package.json.** `registry`, `access: "restricted"`.
  The root `.npmrc` maps `@pixelmord:registry` to the GH Packages endpoint.
- **`NODE_AUTH_TOKEN` in CI.** The release workflow passes `GITHUB_TOKEN` as
  `NODE_AUTH_TOKEN`; the root `.npmrc` reads `${NODE_AUTH_TOKEN}` at publish
  time. Consumer repos use `GH_PACKAGES_TOKEN` secret mapped to the same env var.
- **Changesets config is source of truth for the fixed group.** Adding a new
  `content-ai-*` package requires updating `.changeset/config.json`.

## Rejected alternatives

| Alternative                                          | Reason rejected                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| pnpm workspace symlinks across repos (`link:../../`) | Leaks absolute paths into lockfiles; pixelmord-hq CI breaks unless both repos checked out side-by-side; no version pinning. |
| Public npm with `"private": false`                   | Overkill; GH Packages is free, private, and already scoped to the org owner.                                                |
| Per-package GH Packages repo linking                 | Manual UI step per package; mechanically equivalent to PAT but with more setup friction.                                    |

## Cross-references

ADR 0017 — AI substrate is a separate package (the lift that made distribution necessary)
ADR 0006 — persistence adapter seam
ADR 0011 — AI observability (TraceSummary vs full trace records)

See also: PRD #80 (package lift), issue #95 (this implementation),
`docs/distribution/pixelmord-hq-adoption.md` (consumer onboarding).
