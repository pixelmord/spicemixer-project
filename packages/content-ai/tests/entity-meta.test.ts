import { describe, expect, test } from "vite-plus/test";
import { entityMeta, entityMetaSchema } from "../src/entity-meta.ts";
import type { EntityMeta, EntityMetaSidecar, EntityMetaRef } from "../src/entity-meta.ts";

// ── fake sidecar ──────────────────────────────────────────────────────────────

function makeSidecar(
  initial: Record<string, unknown> = {},
): EntityMetaSidecar & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>(Object.entries(initial));

  function key(ref: EntityMetaRef): string {
    return `${ref.collection}/${ref.locale ?? "_"}/${ref.slug}`;
  }

  return {
    store,
    async read(ref) {
      const data = store.get(key(ref));
      return data !== undefined ? { data } : null;
    },
    async write(ref, data) {
      store.set(key(ref), data);
    },
  };
}

const REF: EntityMetaRef = { collection: "ingredients", locale: "en", slug: "cardamom" };

// ── schema ────────────────────────────────────────────────────────────────────

describe("entityMetaSchema", () => {
  test("parses a valid full payload", () => {
    const result = entityMetaSchema.safeParse({
      draft: true,
      canonicalLocale: "en",
      translationOf: "cardamom",
      translationStaleSince: "2026-01-01T00:00:00.000Z",
      canonicalContentHash: "abc123",
      canonicalFieldHashes: { name: "hash1" },
      translations: { de: "de/kardamom" },
      aiEvents: [],
      featured: true,
      variants: ["cardamom-green"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draft).toBe(true);
      expect(result.data.canonicalLocale).toBe("en");
      expect(result.data.translations).toEqual({ de: "de/kardamom" });
      expect(result.data.featured).toBe(true);
      expect(result.data.variants).toEqual(["cardamom-green"]);
    }
  });

  test("applies defaults for missing fields", () => {
    const result = entityMetaSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draft).toBe(false);
      expect(result.data.aiEvents).toEqual([]);
    }
  });

  test("rejects an invalid aiEvents entry type", () => {
    const result = entityMetaSchema.safeParse({ aiEvents: [{ type: "unknown-event-type" }] });
    expect(result.success).toBe(false);
  });

  test("rejects canonicalLocale longer than 2 chars", () => {
    const result = entityMetaSchema.safeParse({ canonicalLocale: "eng" });
    expect(result.success).toBe(false);
  });

  test("rejects canonicalLocale shorter than 2 chars", () => {
    const result = entityMetaSchema.safeParse({ canonicalLocale: "e" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid translationStaleSince (not ISO datetime)", () => {
    const result = entityMetaSchema.safeParse({ translationStaleSince: "not-a-date" });
    expect(result.success).toBe(false);
  });

  test("accepts undefined optional fields", () => {
    const result = entityMetaSchema.safeParse({ draft: false, aiEvents: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.canonicalLocale).toBeUndefined();
      expect(result.data.translationOf).toBeUndefined();
      expect(result.data.featured).toBeUndefined();
      expect(result.data.variants).toBeUndefined();
    }
  });
});

// ── entityMeta.read ───────────────────────────────────────────────────────────

describe("entityMeta.read", () => {
  test("returns defaults when entity has no meta", async () => {
    const sidecar = makeSidecar();
    const result = await entityMeta.read(sidecar, REF);
    expect(result.draft).toBe(false);
    expect(result.aiEvents).toEqual([]);
  });

  test("parses valid stored meta with all fields", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, {
      draft: true,
      canonicalLocale: "en",
      canonicalContentHash: "deadbeef",
      aiEvents: [],
    });
    const result = await entityMeta.read(sidecar, REF);
    expect(result.draft).toBe(true);
    expect(result.canonicalLocale).toBe("en");
    expect(result.canonicalContentHash).toBe("deadbeef");
    expect(result.aiEvents).toEqual([]);
  });

  test("returns defaults when stored meta fails validation", async () => {
    const sidecar = makeSidecar();
    // Store an invalid payload (canonicalLocale too long)
    await sidecar.write(REF, { canonicalLocale: "toolong", aiEvents: [] });
    const result = await entityMeta.read(sidecar, REF);
    expect(result.draft).toBe(false);
    expect(result.aiEvents).toEqual([]);
  });

  test("strips unknown fields not in schema", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, {
      draft: false,
      aiEvents: [],
      recipeSpecificField: "should be stripped",
    });
    const result = await entityMeta.read(sidecar, REF);
    expect((result as Record<string, unknown>)["recipeSpecificField"]).toBeUndefined();
  });

  test("resolves aiEvents array from stored data", async () => {
    const sidecar = makeSidecar();
    const event = {
      type: "accepted" as const,
      field: "name",
      suggestion: { hash: "abc", summary: "A name" },
      at: "2026-01-01T00:00:00.000Z",
      model: "claude-sonnet-4-6",
    };
    await sidecar.write(REF, { draft: false, aiEvents: [event] });
    const result = await entityMeta.read(sidecar, REF);
    expect(result.aiEvents).toHaveLength(1);
    expect(result.aiEvents[0]?.type).toBe("accepted");
    expect(result.aiEvents[0]?.field).toBe("name");
  });
});

// ── entityMeta.merge ──────────────────────────────────────────────────────────

describe("entityMeta.merge", () => {
  test("writes partial to an empty sidecar", async () => {
    const sidecar = makeSidecar();
    await entityMeta.merge(sidecar, REF, { draft: true });
    const stored = (await sidecar.read(REF))!.data as Record<string, unknown>;
    expect(stored["draft"]).toBe(true);
  });

  test("preserves untouched fields when merging", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { draft: false, canonicalLocale: "en", aiEvents: [] });
    await entityMeta.merge(sidecar, REF, { draft: true });
    const stored = (await sidecar.read(REF))!.data as Record<string, unknown>;
    expect(stored["draft"]).toBe(true);
    expect(stored["canonicalLocale"]).toBe("en");
    expect(stored["aiEvents"]).toEqual([]);
  });

  test("adds new fields without dropping existing ones", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { draft: false });
    await entityMeta.merge(sidecar, REF, { canonicalLocale: "de" });
    const stored = (await sidecar.read(REF))!.data as Record<string, unknown>;
    expect(stored["draft"]).toBe(false);
    expect(stored["canonicalLocale"]).toBe("de");
  });

  test("preserves extra kind-specific fields not in EntityMeta schema", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, {
      draft: false,
      aiEvents: [],
      ingredientLinks: [{ pattern: "cardamom", slug: "cardamom" }],
    });
    await entityMeta.merge(sidecar, REF, { draft: true });
    const stored = (await sidecar.read(REF))!.data as Record<string, unknown>;
    expect(stored["draft"]).toBe(true);
    expect(stored["ingredientLinks"]).toEqual([{ pattern: "cardamom", slug: "cardamom" }]);
  });

  test("overwrites a field when the partial contains it", async () => {
    const sidecar = makeSidecar();
    await sidecar.write(REF, { draft: false, canonicalLocale: "en" });
    await entityMeta.merge(sidecar, REF, { canonicalLocale: "de" });
    const stored = (await sidecar.read(REF))!.data as Record<string, unknown>;
    expect(stored["canonicalLocale"]).toBe("de");
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe("round-trip: read → merge → read is lossless", () => {
  test("merging partial preserves all previously stored EntityMeta fields", async () => {
    const sidecar = makeSidecar();
    const initial: EntityMeta = {
      draft: false,
      canonicalLocale: "en",
      canonicalContentHash: "hash123",
      canonicalFieldHashes: { name: "nHash" },
      aiEvents: [],
    };
    await sidecar.write(REF, initial);

    await entityMeta.merge(sidecar, REF, { draft: true });
    const result = await entityMeta.read(sidecar, REF);

    expect(result.draft).toBe(true);
    expect(result.canonicalLocale).toBe("en");
    expect(result.canonicalContentHash).toBe("hash123");
    expect(result.canonicalFieldHashes).toEqual({ name: "nHash" });
    expect(result.aiEvents).toEqual([]);
  });

  test("multiple sequential merges accumulate correctly", async () => {
    const sidecar = makeSidecar();
    await entityMeta.merge(sidecar, REF, { draft: true });
    await entityMeta.merge(sidecar, REF, { canonicalLocale: "en" });
    await entityMeta.merge(sidecar, REF, { draft: false });

    const result = await entityMeta.read(sidecar, REF);
    expect(result.draft).toBe(false);
    expect(result.canonicalLocale).toBe("en");
  });
});
