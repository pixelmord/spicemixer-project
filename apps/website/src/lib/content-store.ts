export type RecipeCollection = "recipes" | "mixtures";
export type Collection =
  | RecipeCollection
  | "ingredients"
  | "meta"
  | "ingredientMeta"
  | "pairings"
  | "pairingMeta";

export interface ContentItem<T = unknown> {
  collection: Collection;
  /** Bare slug for recipes/mixtures; "en/cardamom" for ingredients; "recipes/miso-butter-ramen" for meta. */
  id: string;
  data: T;
  updatedAt?: string;
}

/**
 * The load-bearing persistence contract for all admin writes. See ADR 0006.
 *
 * **Single-step write invariant.** `put(collection, id, data)` either
 * succeeds (content is durably saved) or throws. Multi-step approval flows
 * (branch PR review) live *outside* this interface — git handles them.
 * No `stage`/`review`/`approve` methods will ever appear here.
 *
 * **Per-adapter expectations:**
 * - `LocalFsStore` (Phase 1): writes JSON to `src/content/` on the lead
 *   curator's local machine. Operates under the localhost-trust assumption
 *   from ADR 0004 — no auth, no rate limiting, no conflict resolution.
 * - `GitHubStore` (Phase 2, stub): writes via the GitHub REST API; each
 *   `put` commits to a per-contributor branch and the lead curator reviews
 *   via PR. Community-origin writes bypass AI auto-apply per ADR 0004.
 * - `InMemoryStore`: test-only; never touches disk or network.
 *
 * **`BatchStore` explicitly deferred.** A bulk-migration adapter for
 * transactional multi-item writes was considered and deferred per ADR 0006
 * until a concrete migration is scheduled. Do not introduce it prematurely.
 *
 * **Bypass rule.** Admin code outside `lib/stores/` must never import
 * `node:fs`, `node:fs/promises`, `fs/promises`, or `node:path` directly.
 * Doing so is a Phase-1 leak that will break the Phase 2 store swap.
 * This is enforced by `lib/stores/contract.test.ts`.
 */
export interface ContentStore {
  list(collection: Collection): Promise<ContentItem[]>;
  get(collection: Collection, id: string): Promise<ContentItem | null>;
  put(collection: Collection, id: string, data: unknown): Promise<void>;
  delete(collection: Collection, id: string): Promise<void>;
}

/**
 * Returns a ContentStore instance based on the CONTENT_STORE env var.
 * - (default)  → LocalFsStore  — writes JSON to src/content/ on disk
 * - "github"   → GitHubStore   — writes via GitHub REST API (stub)
 */
export async function createStore(): Promise<ContentStore> {
  if (import.meta.env.CONTENT_STORE === "github") {
    const { GitHubStore } = await import("./stores/github.ts");
    return new GitHubStore();
  }
  const { LocalFsStore } = await import("./stores/local-fs.ts");
  return new LocalFsStore();
}
