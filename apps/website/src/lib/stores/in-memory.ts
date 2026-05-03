import type { Collection, ContentItem, ContentStore } from "../content-store.ts";

/**
 * In-memory ContentStore for tests. Mirrors LocalFsStore's locale-prefix
 * filter for ingredients so tests faithfully exercise the contract that
 * production code sees. ingredientMeta keys are always locale-prefixed
 * because MetaSidecar is the only write path.
 */
export class InMemoryStore implements ContentStore {
  #items = new Map<string, ContentItem>();

  #key(collection: Collection, id: string): string {
    return `${collection}::${id}`;
  }

  async list(collection: Collection): Promise<ContentItem[]> {
    const items = Array.from(this.#items.values()).filter((i) => i.collection === collection);
    if (collection === "ingredients") {
      return items.filter((item) => /^[a-z]{2}\//.test(item.id));
    }
    return items;
  }

  async get(collection: Collection, id: string): Promise<ContentItem | null> {
    return this.#items.get(this.#key(collection, id)) ?? null;
  }

  async put(collection: Collection, id: string, data: unknown): Promise<void> {
    this.#items.set(this.#key(collection, id), {
      collection,
      id,
      data,
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(collection: Collection, id: string): Promise<void> {
    this.#items.delete(this.#key(collection, id));
  }
}
