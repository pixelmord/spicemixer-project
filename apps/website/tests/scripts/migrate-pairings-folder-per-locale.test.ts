import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  migratePairingsPerLocale,
  revertPairingsPerLocale,
} from "../../scripts/migrate-pairings-folder-per-locale.ts";

let contentRoot: string;
let pairingsDir: string;

beforeEach(async () => {
  contentRoot = await mkdtemp(join(tmpdir(), "spicemixer-pairing-migration-test-"));
  pairingsDir = join(contentRoot, "pairings");
  await mkdir(pairingsDir, { recursive: true });
});

afterEach(async () => {
  await rm(contentRoot, { recursive: true, force: true });
});

async function writePairing(id: string, data: object): Promise<void> {
  await writeFile(join(pairingsDir, `${id}.json`), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function writeMeta(id: string, data: object): Promise<void> {
  await writeFile(
    join(pairingsDir, `${id}.meta.json`),
    JSON.stringify(data, null, 2) + "\n",
    "utf-8",
  );
}

async function readJson(rel: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(pairingsDir, rel), "utf-8")) as Record<string, unknown>;
}

async function exists(rel: string): Promise<boolean> {
  try {
    await access(join(pairingsDir, rel));
    return true;
  } catch {
    return false;
  }
}

describe("migratePairingsPerLocale — bilateral pairing", () => {
  test("creates en/ and de/ content files with correct shape", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: {
        en: "Caraway and cumin are essential companions in Harissa.",
        de: "Die Kombination aus Kümmel und Anis ist essentiell.",
      },
    });
    await writeMeta("caraway--cumin", {});

    await migratePairingsPerLocale(contentRoot);

    const en = await readJson("en/caraway--cumin.json");
    const de = await readJson("de/caraway--cumin.json");

    expect(en).toMatchObject({
      endpoints: [
        { collection: "ingredients", slug: "caraway" },
        { collection: "ingredients", slug: "cumin" },
      ],
      description: "Caraway and cumin are essential companions in Harissa.",
    });
    expect(de).toMatchObject({
      endpoints: [
        { collection: "ingredients", slug: "caraway" },
        { collection: "ingredients", slug: "cumin" },
      ],
      description: "Die Kombination aus Kümmel und Anis ist essentiell.",
    });
  });

  test("en record gets canonicalLocale=en, de gets translationOf", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN text", de: "DE text" },
    });
    await writeMeta("caraway--cumin", {});

    await migratePairingsPerLocale(contentRoot);

    const enMeta = await readJson("en/caraway--cumin.meta.json");
    const deMeta = await readJson("de/caraway--cumin.meta.json");

    expect(enMeta).toMatchObject({ canonicalLocale: "en", featured: true });
    expect(enMeta).not.toHaveProperty("translationOf");
    expect(deMeta).toMatchObject({
      canonicalLocale: "en",
      translationOf: "caraway--cumin",
      featured: true,
    });
  });

  test("deletes original flat files", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN", de: "DE" },
    });
    await writeMeta("caraway--cumin", {});

    await migratePairingsPerLocale(contentRoot);

    expect(await exists("caraway--cumin.json")).toBe(false);
    expect(await exists("caraway--cumin.meta.json")).toBe(false);
  });

  test("preserves draft flag on both per-locale metas", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN text", de: "DE text" },
    });
    await writeMeta("caraway--cumin", { draft: true });

    await migratePairingsPerLocale(contentRoot);

    const enMeta = await readJson("en/caraway--cumin.meta.json");
    const deMeta = await readJson("de/caraway--cumin.meta.json");

    expect(enMeta).toMatchObject({ draft: true, featured: true });
    expect(deMeta).toMatchObject({ draft: true, featured: true });
  });
});

describe("migratePairingsPerLocale — single-locale pairing", () => {
  test("DE-only pairing creates only de/ record with canonicalLocale=de", async () => {
    await writePairing("cumin--saffron", {
      ingredients: ["cumin", "saffron"],
      descriptions: { de: "Die Erdigkeit des Kreuzkümmels gleicht die Süße des Safrans aus." },
    });
    await writeMeta("cumin--saffron", {});

    await migratePairingsPerLocale(contentRoot);

    expect(await exists("de/cumin--saffron.json")).toBe(true);
    expect(await exists("en/cumin--saffron.json")).toBe(false);

    const deMeta = await readJson("de/cumin--saffron.meta.json");
    expect(deMeta).toMatchObject({ canonicalLocale: "de", featured: true });
    expect(deMeta).not.toHaveProperty("translationOf");
  });

  test("EN-only pairing creates only en/ record with canonicalLocale=en", async () => {
    await writePairing("chili-powder--cumin", {
      ingredients: ["chili-powder", "cumin"],
      descriptions: {
        en: "Cumin's warm, earthy flavor complements the smoky heat of chili powder.",
      },
    });
    await writeMeta("chili-powder--cumin", {});

    await migratePairingsPerLocale(contentRoot);

    expect(await exists("en/chili-powder--cumin.json")).toBe(true);
    expect(await exists("de/chili-powder--cumin.json")).toBe(false);

    const enMeta = await readJson("en/chili-powder--cumin.meta.json");
    expect(enMeta).toMatchObject({ canonicalLocale: "en", featured: true });
  });
});

describe("migratePairingsPerLocale — demo pairings", () => {
  test("deletes caraway--fenugreek (demo) outright", async () => {
    await writePairing("caraway--fenugreek", {
      ingredients: ["caraway", "fenugreek"],
      descriptions: { en: "Gemeinsam bilden sie die bitter-warme Basis..." },
    });
    await writeMeta("caraway--fenugreek", {});

    await migratePairingsPerLocale(contentRoot);

    expect(await exists("caraway--fenugreek.json")).toBe(false);
    expect(await exists("caraway--fenugreek.meta.json")).toBe(false);
    expect(await exists("en/caraway--fenugreek.json")).toBe(false);
    expect(await exists("de/caraway--fenugreek.json")).toBe(false);
  });

  test("deletes cardamom--cumin (demo) outright", async () => {
    await writePairing("cardamom--cumin", {
      ingredients: ["cardamom", "cumin"],
      descriptions: { en: "Gemeinsam bilden sie die warme Basis vieler Gewürzmischungen..." },
    });
    await writeMeta("cardamom--cumin", {});

    await migratePairingsPerLocale(contentRoot);

    expect(await exists("cardamom--cumin.json")).toBe(false);
    expect(await exists("en/cardamom--cumin.json")).toBe(false);
  });

  test("returns correct deleted count for demo pairings", async () => {
    await writePairing("caraway--fenugreek", {
      ingredients: ["caraway", "fenugreek"],
      descriptions: { en: "..." },
    });
    await writeMeta("caraway--fenugreek", {});
    await writePairing("cardamom--cumin", {
      ingredients: ["cardamom", "cumin"],
      descriptions: { en: "..." },
    });
    await writeMeta("cardamom--cumin", {});

    const stats = await migratePairingsPerLocale(contentRoot);
    expect(stats.deleted).toBe(2);
  });
});

describe("migratePairingsPerLocale — featured flag", () => {
  test("seeds featured: true on every retained pairing meta", async () => {
    await writePairing("cumin--koriander", {
      ingredients: ["cumin", "koriander"],
      descriptions: { en: "Cumin and coriander pair well." },
    });
    await writeMeta("cumin--koriander", {});

    await migratePairingsPerLocale(contentRoot);

    const enMeta = await readJson("en/cumin--koriander.meta.json");
    expect(enMeta).toHaveProperty("featured", true);
  });
});

describe("migratePairingsPerLocale — endpoints shape", () => {
  test("widens ingredients tuple to endpoints with collection: ingredients", async () => {
    await writePairing("cumin--sumac", {
      ingredients: ["cumin", "sumac"],
      descriptions: { de: "Eine klassische nordafrikanische Kombination." },
    });
    await writeMeta("cumin--sumac", {});

    await migratePairingsPerLocale(contentRoot);

    const de = await readJson("de/cumin--sumac.json");
    expect(de["endpoints"]).toEqual([
      { collection: "ingredients", slug: "cumin" },
      { collection: "ingredients", slug: "sumac" },
    ]);
    expect(de).not.toHaveProperty("ingredients");
  });
});

describe("migratePairingsPerLocale — idempotency", () => {
  test("running twice produces same final state", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN text", de: "DE text" },
    });
    await writeMeta("caraway--cumin", {});

    await migratePairingsPerLocale(contentRoot);
    const stats2 = await migratePairingsPerLocale(contentRoot);

    expect(stats2.migrated).toBe(0);
    expect(stats2.deleted).toBe(0);
    // Per-locale files remain intact
    expect(await exists("en/caraway--cumin.json")).toBe(true);
    expect(await exists("de/caraway--cumin.json")).toBe(true);
  });

  test("skips already-migrated locale files without error", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN", de: "DE" },
    });
    await writeMeta("caraway--cumin", {});

    const stats1 = await migratePairingsPerLocale(contentRoot);
    const stats2 = await migratePairingsPerLocale(contentRoot);

    expect(stats1.migrated).toBe(1);
    expect(stats2.migrated).toBe(0);
    expect(stats2.skipped).toBe(0); // flat files gone on 2nd run, no flat files to process
  });
});

describe("reversibility — revertPairingsPerLocale", () => {
  test("inverse reconstructs inline descriptions shape", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "Caraway and cumin: Harissa companions.", de: "Kümmel und Kreuzkümmel." },
    });
    await writeMeta("caraway--cumin", {});

    await migratePairingsPerLocale(contentRoot);
    await revertPairingsPerLocale(contentRoot);

    const flat = await readJson("caraway--cumin.json");
    expect(flat).toMatchObject({
      ingredients: ["caraway", "cumin"],
      descriptions: {
        en: "Caraway and cumin: Harissa companions.",
        de: "Kümmel und Kreuzkümmel.",
      },
    });
  });

  test("inverse removes per-locale files", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN", de: "DE" },
    });
    await writeMeta("caraway--cumin", {});

    await migratePairingsPerLocale(contentRoot);
    await revertPairingsPerLocale(contentRoot);

    expect(await exists("en/caraway--cumin.json")).toBe(false);
    expect(await exists("de/caraway--cumin.json")).toBe(false);
    expect(await exists("caraway--cumin.json")).toBe(true);
  });

  test("draft flag survives round-trip", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN", de: "DE" },
    });
    await writeMeta("caraway--cumin", { draft: true });

    await migratePairingsPerLocale(contentRoot);
    await revertPairingsPerLocale(contentRoot);

    const meta = await readJson("caraway--cumin.meta.json");
    expect(meta["draft"]).toBe(true);
  });
});

describe("migratePairingsPerLocale — stats", () => {
  test("returns correct migrated count", async () => {
    await writePairing("caraway--cumin", {
      ingredients: ["caraway", "cumin"],
      descriptions: { en: "EN", de: "DE" },
    });
    await writeMeta("caraway--cumin", {});
    await writePairing("cumin--saffron", {
      ingredients: ["cumin", "saffron"],
      descriptions: { de: "DE only" },
    });
    await writeMeta("cumin--saffron", {});

    const stats = await migratePairingsPerLocale(contentRoot);
    expect(stats.migrated).toBe(2);
    expect(stats.deleted).toBe(0);
  });
});
