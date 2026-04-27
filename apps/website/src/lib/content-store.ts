export type RecipeCollection = "recipes" | "spicemixes" | "sauces";
export type Collection = RecipeCollection | "ingredients" | "meta";

export interface ContentItem<T = unknown> {
  collection: Collection;
  /** Bare slug for recipes/spicemixes/sauces; "en/cardamom" for ingredients; "recipes/miso-butter-ramen" for meta. */
  id: string;
  data: T;
  updatedAt?: string;
}

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
