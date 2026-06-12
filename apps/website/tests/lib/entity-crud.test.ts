import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar, INGREDIENT_META, PAIRING_META } from "../../src/lib/meta-sidecar.ts";
import { deleteEntity, setPublishState, type EntityCrudRef } from "../../src/lib/entity-crud.ts";
import { NotFoundError } from "../../src/lib/errors.ts";

// One fixture per kind proves the helpers are uniform across recipes,
// ingredients, and pairings — the asymmetry candidate 5 collapses.
const KINDS: Array<{
  name: string;
  contentId: string;
  metaColl: "meta" | typeof INGREDIENT_META | typeof PAIRING_META;
  metaKey: string;
  ref: EntityCrudRef;
}> = [
  {
    name: "recipe",
    contentId: "en/miso-ramen",
    metaColl: "meta",
    metaKey: "recipes/en/miso-ramen",
    ref: { collection: "recipes", locale: "en", slug: "miso-ramen" },
  },
  {
    name: "ingredient",
    contentId: "en/cardamom",
    metaColl: INGREDIENT_META,
    metaKey: "en/cardamom",
    ref: { collection: "ingredients", locale: "en", slug: "cardamom" },
  },
  {
    name: "pairing",
    contentId: "en/anise--cardamom",
    metaColl: PAIRING_META,
    metaKey: "en/anise--cardamom",
    ref: { collection: "pairings", locale: "en", slug: "anise--cardamom" },
  },
];

describe("deleteEntity", () => {
  for (const kind of KINDS) {
    test(`${kind.name}: removes both the content record and its meta sidecar`, async () => {
      const store = new InMemoryStore();
      const sidecar = createMetaSidecar(store);
      await store.put(kind.ref.collection, kind.contentId, { name: "X" });
      await store.put(kind.metaColl, kind.metaKey, { draft: true });

      await deleteEntity(store, sidecar, kind.ref);

      expect(await store.get(kind.ref.collection, kind.contentId)).toBeNull();
      expect(await store.get(kind.metaColl, kind.metaKey)).toBeNull();
    });
  }

  test("is idempotent for a nonexistent record", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await expect(
      deleteEntity(store, sidecar, { collection: "mixtures", locale: "en", slug: "ghost" }),
    ).resolves.toBeUndefined();
  });

  test("does not affect other-locale records", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("pairings", "en/anise--cardamom", { description: "x" });
    await store.put("pairings", "de/anise--cardamom", { description: "y" });

    await deleteEntity(store, sidecar, {
      collection: "pairings",
      locale: "en",
      slug: "anise--cardamom",
    });

    expect(await store.get("pairings", "en/anise--cardamom")).toBeNull();
    expect(await store.get("pairings", "de/anise--cardamom")).not.toBeNull();
  });
});

describe("setPublishState", () => {
  for (const kind of KINDS) {
    test(`${kind.name}: draft=false preserves other meta fields`, async () => {
      const store = new InMemoryStore();
      const sidecar = createMetaSidecar(store);
      await store.put(kind.ref.collection, kind.contentId, { name: "X" });
      await store.put(kind.metaColl, kind.metaKey, { draft: true, keep: "me" });

      await setPublishState(store, sidecar, kind.ref, false);

      const meta = await store.get(kind.metaColl, kind.metaKey);
      expect(meta?.data).toEqual({ draft: false, keep: "me" });
    });

    test(`${kind.name}: draft=true flips an existing published record`, async () => {
      const store = new InMemoryStore();
      const sidecar = createMetaSidecar(store);
      await store.put(kind.ref.collection, kind.contentId, { name: "X" });
      await store.put(kind.metaColl, kind.metaKey, { draft: false });

      await setPublishState(store, sidecar, kind.ref, true);

      const meta = await store.get(kind.metaColl, kind.metaKey);
      expect((meta!.data as Record<string, unknown>)["draft"]).toBe(true);
    });

    test(`${kind.name}: throws NotFoundError when the content record is missing`, async () => {
      const store = new InMemoryStore();
      const sidecar = createMetaSidecar(store);
      await expect(setPublishState(store, sidecar, kind.ref, false)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  }

  test("writes to the locale-scoped meta key for DE", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put("pairings", "de/anise--cardamom", { description: "y" });

    await setPublishState(
      store,
      sidecar,
      { collection: "pairings", locale: "de", slug: "anise--cardamom" },
      true,
    );

    const meta = await store.get(PAIRING_META, "de/anise--cardamom");
    expect((meta!.data as Record<string, unknown>)["draft"]).toBe(true);
    expect(await store.get(PAIRING_META, "en/anise--cardamom")).toBeNull();
  });
});
