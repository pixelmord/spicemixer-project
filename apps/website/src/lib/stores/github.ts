import type { Collection, ContentItem, ContentStore } from "../content-store.ts";

/**
 * GitHub API-backed content store. Phase 2 — see ADR 0006.
 *
 * In Phase 1 the admin runs local-only via `LocalFsStore`; this store
 * stays a stub. In Phase 2 the admin ships hosted; community writes
 * land on a per-contributor branch via the GitHub API and the lead
 * curator reviews via PR. Single-step `put` from the interface
 * encapsulates the commit-to-branch step internally.
 *
 * Env vars (Phase 2):
 *   GITHUB_TOKEN     — personal access token / GitHub App token
 *   GITHUB_REPO      — "owner/repo"
 *   GITHUB_BRANCH    — base branch (default: "main")
 *   GITHUB_BASE_PATH — path prefix inside repo (e.g. "apps/website/src/content")
 */
export class GitHubStore implements ContentStore {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async list(_collection: Collection): Promise<ContentItem[]> {
    throw new Error("GitHubStore: not implemented (Phase 2 stub — see ADR 0006)");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async get(_collection: Collection, _id: string): Promise<ContentItem | null> {
    throw new Error("GitHubStore: not implemented (Phase 2 stub — see ADR 0006)");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(_collection: Collection, _id: string, _data: unknown): Promise<void> {
    throw new Error("GitHubStore: not implemented (Phase 2 stub — see ADR 0006)");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_collection: Collection, _id: string): Promise<void> {
    throw new Error("GitHubStore: not implemented (Phase 2 stub — see ADR 0006)");
  }
}
