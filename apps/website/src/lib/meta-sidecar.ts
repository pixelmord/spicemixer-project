import type { Collection, ContentItem, ContentStore } from "./content-store.ts";

export const INGREDIENT_META = "ingredientMeta" as const;
export const PAIRING_META = "pairingMeta" as const;

export type MetaCollection = "meta" | typeof INGREDIENT_META | typeof PAIRING_META;
export type SyncCollection = "ingredients" | "recipes" | "mixtures";

export type MetaRef = {
  collection: Collection;
  locale?: string;
  slug: string;
};

export interface MetaSidecar {
  resolve(ref: MetaRef): { metaCollection: MetaCollection; key: string };
  read(ref: MetaRef): Promise<ContentItem | null>;
  write(ref: MetaRef, data: unknown): Promise<void>;
  exists(ref: MetaRef): Promise<boolean>;
  remove(ref: MetaRef): Promise<void>;
  /**
   * List all meta items for a SyncCollection. Used by translation-sync to
   * iterate translation children without constructing collection-specific keys.
   */
  listSync(
    collection: SyncCollection,
  ): Promise<Array<{ metaCollection: MetaCollection; id: string; data: unknown }>>;
  /**
   * Write back to a meta collection by its already-resolved id. Used by
   * translation-sync when iterating items returned from listSync.
   */
  updateById(metaCollection: MetaCollection, id: string, data: unknown): Promise<void>;
}

class MetaSidecarAdapter implements MetaSidecar {
  #store: ContentStore;

  constructor(store: ContentStore) {
    this.#store = store;
  }

  resolve(ref: MetaRef): { metaCollection: MetaCollection; key: string } {
    const { collection, locale, slug } = ref;
    if (collection === "ingredients") {
      if (!locale) throw new Error("MetaSidecar.resolve: locale required for ingredients");
      return { metaCollection: INGREDIENT_META, key: `${locale}/${slug}` };
    }
    if (collection === "pairings") {
      return { metaCollection: PAIRING_META, key: slug };
    }
    // recipes, mixtures, or any other recipe-collection kind
    return { metaCollection: "meta", key: `${collection}/${slug}` };
  }

  async read(ref: MetaRef): Promise<ContentItem | null> {
    const { metaCollection, key } = this.resolve(ref);
    return this.#store.get(metaCollection, key);
  }

  async write(ref: MetaRef, data: unknown): Promise<void> {
    const { metaCollection, key } = this.resolve(ref);
    await this.#store.put(metaCollection, key, data);
  }

  async exists(ref: MetaRef): Promise<boolean> {
    return (await this.read(ref)) !== null;
  }

  async remove(ref: MetaRef): Promise<void> {
    const { metaCollection, key } = this.resolve(ref);
    await this.#store.delete(metaCollection, key);
  }

  async listSync(
    collection: SyncCollection,
  ): Promise<Array<{ metaCollection: MetaCollection; id: string; data: unknown }>> {
    if (collection === "ingredients") {
      const items = await this.#store.list(INGREDIENT_META);
      return items.map((i) => ({
        metaCollection: INGREDIENT_META as MetaCollection,
        id: i.id,
        data: i.data,
      }));
    }
    const items = await this.#store.list("meta");
    const prefix = `${collection}/`;
    return items
      .filter((i) => i.id.startsWith(prefix))
      .map((i) => ({ metaCollection: "meta" as MetaCollection, id: i.id, data: i.data }));
  }

  async updateById(metaCollection: MetaCollection, id: string, data: unknown): Promise<void> {
    await this.#store.put(metaCollection, id, data);
  }
}

export function createMetaSidecar(store: ContentStore): MetaSidecar {
  return new MetaSidecarAdapter(store);
}
