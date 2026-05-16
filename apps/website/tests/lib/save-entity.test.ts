import { describe, expect, test } from "vite-plus/test";
import { InMemoryStore } from "../../src/lib/stores/in-memory.ts";
import { createMetaSidecar, INGREDIENT_META } from "../../src/lib/meta-sidecar.ts";
import { saveEntity } from "../../src/lib/save-entity.ts";
import type { SaveEntityRef } from "../../src/lib/save-entity.ts";

// ── basic persistence ──────────────────────────────────────────────────────

describe("saveEntity — content write", () => {
  test("persists ingredient under locale/slug", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "en", slug: "cardamom" },
      content: { name: "Cardamom", category: "spice" },
    });
    const stored = await store.get("ingredients", "en/cardamom");
    expect(stored?.data).toEqual({ name: "Cardamom", category: "spice" });
  });

  test("persists recipe under locale/slug", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "recipes", locale: "en", slug: "miso-ramen" },
      content: { name: "Miso Ramen" },
    });
    const stored = await store.get("recipes", "en/miso-ramen");
    expect(stored?.data).toEqual({ name: "Miso Ramen" });
  });

  test("persists pairing under bare slug", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "pairings", slug: "anise--cardamom" },
      content: { ingredients: [], descriptions: { en: "x" } },
    });
    const stored = await store.get("pairings", "anise--cardamom");
    expect(stored?.data).toEqual({ ingredients: [], descriptions: { en: "x" } });
  });

  test("does not touch meta sidecar when meta is undefined", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", { draft: true });
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "en", slug: "cardamom" },
      content: { name: "Cardamom v2" },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual({ draft: true });
  });
});

// ── meta write ─────────────────────────────────────────────────────────────

describe("saveEntity — meta write", () => {
  test("writes ingredient meta sidecar when meta is provided", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "en", slug: "cardamom" },
      content: { name: "Cardamom" },
      meta: { draft: true },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect((meta!.data as Record<string, unknown>)["draft"]).toBe(true);
  });

  test("merges existing ingredient meta (merge-patch)", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await store.put(INGREDIENT_META, "en/cardamom", { translations: { de: "Kardamom" } });
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "en", slug: "cardamom" },
      content: { name: "Cardamom" },
      meta: { draft: false },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(meta?.data).toEqual(
      expect.objectContaining({ translations: { de: "Kardamom" }, draft: false }),
    );
  });

  test("writes pairing meta draft when meta is provided", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "pairings", slug: "anise--cardamom" },
      content: { ingredients: [], descriptions: { en: "x" } },
      meta: { draft: true },
    });
    const meta = await store.get("pairingMeta", "anise--cardamom");
    expect((meta!.data as Record<string, unknown>)["draft"]).toBe(true);
  });
});

// ── canonicalLocale ────────────────────────────────────────────────────────

describe("saveEntity — canonicalLocale (translatable kinds)", () => {
  test("stamps canonicalLocale from ref.locale on first ingredient save", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "de", slug: "kardamom" },
      content: { name: "Kardamom" },
      meta: { draft: true },
    });
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("stamps canonicalLocale from meta.locale for recipes", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "recipes", locale: "en", slug: "miso-ramen" },
      content: { name: "Miso Ramen" },
      meta: { locale: "en", draft: true },
    });
    const meta = await store.get("meta", "recipes/en/miso-ramen");
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBe("en");
  });

  test("does not overwrite canonicalLocale on subsequent saves", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "de", slug: "kardamom" },
      content: { name: "Kardamom" },
      meta: { draft: true },
    });
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "de", slug: "kardamom" },
      content: { name: "Kardamom updated" },
      meta: { draft: false },
    });
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBe("de");
  });

  test("does not stamp canonicalLocale for pairing (non-translatable)", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "pairings", slug: "anise--cardamom" },
      content: { ingredients: [], descriptions: { en: "x" } },
      meta: { draft: true },
    });
    const meta = await store.get("pairingMeta", "anise--cardamom");
    expect((meta!.data as Record<string, unknown>)["canonicalLocale"]).toBeUndefined();
  });
});

// ── canonicalContentHash ───────────────────────────────────────────────────

describe("saveEntity — canonicalContentHash (translatable kinds)", () => {
  test("stamps canonicalContentHash into meta for canonical ingredient save", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "en", slug: "cardamom" },
      content: { name: "Cardamom" },
      meta: { draft: false },
    });
    const meta = await store.get(INGREDIENT_META, "en/cardamom");
    expect(typeof (meta!.data as Record<string, unknown>)["canonicalContentHash"]).toBe("string");
  });

  test("does not stamp canonicalContentHash for translation-side save", async () => {
    const store = new InMemoryStore();
    const sidecar = createMetaSidecar(store);
    await saveEntity(store, sidecar, {
      ref: { collection: "ingredients", locale: "de", slug: "kardamom" },
      content: { name: "Kardamom" },
      meta: { translationOf: "en/cardamom", draft: false },
    });
    const meta = await store.get(INGREDIENT_META, "de/kardamom");
    expect((meta!.data as Record<string, unknown>)["canonicalContentHash"]).toBeUndefined();
  });
});

// ── translation-sync contract (parameterised over translatable EntityKinds) ─

type KindCase = {
  kind: string;
  ref: SaveEntityRef;
  content1: Record<string, unknown>;
  content2: Record<string, unknown>;
  childMetaCollection: string;
  childId: string;
  translationOf: string;
};

const translationSyncCases: KindCase[] = [
  {
    kind: "ingredient",
    ref: { collection: "ingredients", locale: "en", slug: "cardamom" },
    content1: { name: "Cardamom", category: "spice" },
    content2: { name: "Cardamom updated", category: "spice" },
    childMetaCollection: INGREDIENT_META,
    childId: "de/cardamom",
    translationOf: "en/cardamom",
  },
  {
    kind: "recipe",
    ref: { collection: "recipes", locale: "en", slug: "miso-ramen" },
    content1: { name: "Miso Ramen" },
    content2: { name: "Miso Ramen updated" },
    childMetaCollection: "meta",
    childId: "recipes/de/miso-ramen-de",
    translationOf: "miso-ramen",
  },
];

describe("saveEntity — translation-sync contract (parameterised over translatable EntityKinds)", () => {
  for (const {
    kind,
    ref,
    content1,
    content2,
    childMetaCollection,
    childId,
    translationOf,
  } of translationSyncCases) {
    describe(kind, () => {
      test("canonical save flags translation children stale when content changes", async () => {
        const store = new InMemoryStore();
        const sidecar = createMetaSidecar(store);
        await saveEntity(store, sidecar, {
          ref,
          content: content1,
          meta: { locale: ref.locale, draft: false },
        });
        await store.put(childMetaCollection as Parameters<typeof store.put>[0], childId, {
          translationOf,
        });
        await saveEntity(store, sidecar, {
          ref,
          content: content2,
          meta: { locale: ref.locale, draft: false },
        });
        const child = await store.get(
          childMetaCollection as Parameters<typeof store.get>[0],
          childId,
        );
        expect(typeof (child!.data as Record<string, unknown>)["translationStaleSince"]).toBe(
          "string",
        );
      });

      test("canonical save with unchanged content does not re-flag translations", async () => {
        const store = new InMemoryStore();
        const sidecar = createMetaSidecar(store);
        await saveEntity(store, sidecar, {
          ref,
          content: content1,
          meta: { locale: ref.locale, draft: false },
        });
        await store.put(childMetaCollection as Parameters<typeof store.put>[0], childId, {
          translationOf,
        });
        await saveEntity(store, sidecar, {
          ref,
          content: content1,
          meta: { locale: ref.locale, draft: false },
        });
        const child = await store.get(
          childMetaCollection as Parameters<typeof store.get>[0],
          childId,
        );
        expect((child!.data as Record<string, unknown>)["translationStaleSince"]).toBeUndefined();
      });

      test("translation-side save does not flag canonical as stale", async () => {
        const store = new InMemoryStore();
        const sidecar = createMetaSidecar(store);
        // Canonical already exists
        await saveEntity(store, sidecar, {
          ref,
          content: content1,
          meta: { locale: ref.locale, draft: false },
        });
        const canonicalMeta = await store.get(
          childMetaCollection as Parameters<typeof store.get>[0],
          kind === "ingredient"
            ? `${ref.locale}/${ref.slug}`
            : `${ref.collection}/${ref.locale}/${ref.slug}`,
        );
        const initialHash = (canonicalMeta?.data as Record<string, unknown>)?.[
          "canonicalContentHash"
        ];

        // Now save a translation (has translationOf)
        const translationRef: SaveEntityRef = {
          ...ref,
          locale: "de",
          slug: `${ref.slug}-de`,
        };
        await saveEntity(store, sidecar, {
          ref: translationRef,
          content: content1,
          meta: { translationOf, draft: false },
        });

        // Canonical should not be flagged stale
        const canonicalMetaAfter = await store.get(
          childMetaCollection as Parameters<typeof store.get>[0],
          kind === "ingredient"
            ? `${ref.locale}/${ref.slug}`
            : `${ref.collection}/${ref.locale}/${ref.slug}`,
        );
        expect(
          (canonicalMetaAfter!.data as Record<string, unknown>)["translationStaleSince"],
        ).toBeUndefined();
        expect((canonicalMetaAfter!.data as Record<string, unknown>)["canonicalContentHash"]).toBe(
          initialHash,
        );
      });
    });
  }
});
