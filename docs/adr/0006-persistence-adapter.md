# Persistence via injected ContentStore adapter

All admin writes go through a `ContentStore` interface. The concrete
implementation is **injected at runtime** based on environment, not
hard-coded. This is the load-bearing invariant across the Phase 1 →
Phase 2 transition: the same admin code paths and AI policy run
against different stores in different deploy contexts.

## Phase 1: LocalFsStore (locked)

Phase 1 admin runs **local-only**, on the lead curator's machine.

- **Concrete store:** `LocalFsStore` reads/writes JSON files under
  `apps/website/src/content/`.
- **Workflow:** curator runs `vp dev`, edits via the admin UI at
  `/admin/`, files land on disk, `git commit && git push` ships.
- **Build:** Astro SSG builds in CI from the committed content.
- **Approval flow:** is git. Branch protection + PR review on
  GitHub _is_ the multi-step write. The `ContentStore` interface
  stays single-step (`put(collection, id, data)`); no stage / review
  / approve states are baked in.
- **AI auto-apply:** continues to run under the localhost trust
  assumption from ADR 0004.

### Why local-only

1. **CONTEXT.md and ADR 0004 already lock the answer.**
   "Localhost-gated admin" + "auto-apply is a privilege of the
   localhost-gated workflow" mean any hosted admin needs to revisit
   ADR 0004's threat model. Don't unlock that without cause.
2. **Phase 1 is single-editorial.** The curator is the developer.
   Editor onboarding for non-developers is a Phase 2 problem —
   that's what community curation is _for_.
3. **AI ingestion runs heavy locally.** PDF cookbook extraction,
   Wikipedia scrape, AI translation candidates run better on the
   curator's machine than in serverless functions. The
   `recipe-ingestion` package already assumes this.
4. **Minimal infra.** Zero auth, zero rate limiting, zero
   serverless concerns.

### Cost

- Editor onboarding requires repo clone + `vp install` + `vp dev`.
  This is high friction for non-developers. Acknowledged. Phase 1
  accepts this cost; Phase 2 fixes it.

## Phase 2: GitHubStore (planned)

Phase 2 admin ships to a hosted environment for community
contribution.

- **Concrete store:** `GitHubStore` writes via the GitHub REST API
  using `@octokit/rest`. Each contribution = a commit on a
  branch; the lead curator reviews via standard GitHub PR review
  and merges.
- **Storage shape unchanged.** Content stays as JSON files in the
  repo, schema.org-first. Git remains the source of truth.
- **Auth:** GitHub OAuth for contributors; lead curator uses
  GitHub native permissions for review/merge.
- **AI auto-apply:** disabled for community-origin writes
  (`if (origin === "community") return suggestionOnly`, already
  specified in ADR 0004). The lead curator running locally
  retains auto-apply privileges.
- **`ContentStore` interface still single-step `put`.** The
  branch-and-PR flow is implemented inside `GitHubStore`'s `put`
  (commit to a content-PR branch namespaced per contributor),
  not as separate interface methods. Callers don't need to know
  which store they're talking to.

### Why GitHub API and not headless CMS / DB

- **Content stays in git.** JSON-LD-as-storage, per-locale
  parallel files, the meta-sidecar pattern, and the AI event
  log all assume git history. A CMS or DB breaks the storage
  shape and forces a content migration.
- **Lead curator's review experience is unchanged.** Same `git
diff` review surface they use in Phase 1; community PRs land
  in the same queue.
- **Cost:** auth, rate limiting, conflict handling. All
  contained inside `GitHubStore`.

## The adapter contract

```ts
export interface ContentStore {
  list(collection: Collection): Promise<ContentItem[]>;
  get(collection: Collection, id: string): Promise<ContentItem | null>;
  put(collection: Collection, id: string, data: unknown): Promise<void>;
  delete(collection: Collection, id: string): Promise<void>;
}
```

- **Single-step write.** `put` either succeeds (content is
  durably saved) or fails. Multi-step approval flows live
  _outside_ the interface (git PR review for both Phase 1 and
  Phase 2). Adding stage/review/approve methods would couple
  the interface to a workflow that git already handles.
- **Adapter selected by environment.** `createStore()` reads
  `CONTENT_STORE` env var; default is `LocalFsStore`. Phase 2
  flips `CONTENT_STORE=github` on the hosted admin and provides
  the `GITHUB_*` config.
- **Test isolation.** A third adapter, `InMemoryStore`, exists
  for Vitest. Tests never touch real disk or network.

### Invariants the interface preserves across phases

- **Same admin UI code.** Forms, validation, save-as-draft, AI
  suggestion review — all consume `ContentStore`, never a
  concrete adapter.
- **Same content shape on disk / in repo.** A LocalFsStore-saved
  file and a GitHubStore-committed file are byte-identical.
- **Same AI event log shape.** `aiEvents[]` (ADR 0004) lives in
  the meta sidecar regardless of how the sidecar is written.
- **Same translation stale-flag mechanism.** The content-hash
  watcher reads/writes via `ContentStore`, store-agnostic.

## Alternatives rejected

- **Headless CMS (Sanity, Contentful) for Phase 2.** Breaks
  schema.org-first storage; forces content out of git;
  introduces a separate translation pipeline; cost without
  payoff at Spicemixer's scale.
- **Runtime DB for Phase 2.** Same content-out-of-git problem;
  also requires a runtime backend (kills SSG simplicity).
- **Hard-coding LocalFsStore (no adapter).** Saves a small
  amount of code today but forces a rewrite of every admin
  path when Phase 2 starts. The adapter cost is < 100 LoC and
  preserves Phase-1-locked admin code.
- **Multi-step write inside the interface
  (`stage`/`review`/`approve`/`commit`).** Duplicates git's PR
  review flow. The interface stays minimal; workflows live
  above it.
- **Skip Phase 1 → Phase 2 contract upfront.** Risks bake-in
  of localhost-only assumptions (synchronous fs ops,
  process-local locks, file-watcher coupling) that have to be
  unwound later.

## Consequences

### Code

- Keep `GitHubStore` as a documented stub with a clear
  `// Phase 2 — see ADR 0006` marker until Phase 2 starts.
- Audit admin code paths for direct `fs/promises` or
  `node:path` use that bypasses `ContentStore`. Any such use is
  a Phase-1 leak that will break Phase 2; refactor through the
  store.
- AI ingestion (`recipe-ingestion`, `content-ai`) currently
  assumes local execution. When Phase 2 ships, ingestion runs
  remain on the lead curator's machine, not in the hosted
  admin's runtime — keep ingestion separable from the admin
  store.

### Documentation

- README (Q12) documents Phase 1 editor onboarding: clone,
  `vp install`, `vp dev`, navigate to `/admin/`. Acknowledges
  this is a technical-contributor flow.
- CONTEXT.md notes storage-as-adapter as an architectural
  invariant.
- The Phase 1 → Phase 2 transition criterion (Q11) lists
  "GitHubStore implemented and battle-tested" as a capability
  gate.

### Open follow-ups

- The exact branch-naming convention and PR-template for
  Phase 2 community contributions.
- Conflict-resolution UX when two community contributors edit
  the same entry.
- Hosting platform choice for Phase 2 admin (Vercel, Netlify,
  Cloudflare Pages — all viable; deferred until Phase 2).
- A potential `BatchStore` adapter for bulk migrations
  (mixtures collection migration from `spicemixes`/`sauces`),
  if a single transactional write is needed. Defer until that
  migration is scheduled.
