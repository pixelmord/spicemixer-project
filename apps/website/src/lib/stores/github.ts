import type { Collection, ContentItem, ContentStore } from "../content-store.ts";

/**
 * GitHub API-backed content store.
 *
 * TODO: implement using `@octokit/rest` with env vars:
 *   GITHUB_TOKEN    — personal access token
 *   GITHUB_REPO     — "owner/repo"
 *   GITHUB_BRANCH   — target branch (default: "main")
 *   GITHUB_BASE_PATH — path prefix inside repo (e.g. "apps/website/src/content")
 */
export class GitHubStore implements ContentStore {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async list(_collection: Collection): Promise<ContentItem[]> {
    throw new Error("GitHubStore: not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async get(_collection: Collection, _id: string): Promise<ContentItem | null> {
    throw new Error("GitHubStore: not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(_collection: Collection, _id: string, _data: unknown): Promise<void> {
    throw new Error("GitHubStore: not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_collection: Collection, _id: string): Promise<void> {
    throw new Error("GitHubStore: not implemented");
  }
}
