import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backfillCanonicalLocale } from "../../scripts/migrate-canonical-locale.ts";

let contentRoot: string;

beforeEach(async () => {
  contentRoot = await mkdtemp(join(tmpdir(), "spicemixer-migration-test-"));
  await mkdir(join(contentRoot, "ingredients", "en"), { recursive: true });
  await mkdir(join(contentRoot, "ingredients", "de"), { recursive: true });
  await mkdir(join(contentRoot, "recipes"), { recursive: true });
  await mkdir(join(contentRoot, "mixtures"), { recursive: true });
  await mkdir(join(contentRoot, "pairings"), { recursive: true });
});

afterEach(async () => {
  await rm(contentRoot, { recursive: true, force: true });
});

async function readMeta(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(contentRoot, path), "utf-8")) as Record<string, unknown>;
}

async function writeMeta(path: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(join(contentRoot, path), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

describe("backfillCanonicalLocale — ingredients", () => {
  test("sets canonicalLocale from en/ folder", async () => {
    await writeMeta("ingredients/en/caraway.meta.json", { region: [] });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("ingredients/en/caraway.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("sets canonicalLocale from de/ folder", async () => {
    await writeMeta("ingredients/de/kümmel.meta.json", { region: [] });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("ingredients/de/kümmel.meta.json");
    expect(meta.canonicalLocale).toBe("de");
  });

  test("preserves existing fields when adding canonicalLocale", async () => {
    await writeMeta("ingredients/en/caraway.meta.json", { region: ["europe"], draft: false });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("ingredients/en/caraway.meta.json");
    expect(meta.region).toEqual(["europe"]);
    expect(meta.draft).toBe(false);
    expect(meta.canonicalLocale).toBe("en");
  });

  test("does not overwrite existing canonicalLocale (idempotent)", async () => {
    await writeMeta("ingredients/en/caraway.meta.json", { canonicalLocale: "de", region: [] });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("ingredients/en/caraway.meta.json");
    expect(meta.canonicalLocale).toBe("de");
  });
});

describe("backfillCanonicalLocale — recipes", () => {
  test("sets canonicalLocale from locale field", async () => {
    await writeMeta("recipes/miso-ramen.meta.json", { locale: "en", kind: "recipe" });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("recipes/miso-ramen.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("falls back to language field when locale is absent", async () => {
    await writeMeta("recipes/veg-skillet.meta.json", { language: "en", kind: "recipe" });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("recipes/veg-skillet.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("defaults to en when neither locale nor language is present", async () => {
    await writeMeta("recipes/couscous.meta.json", { kind: "recipe", region: [] });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("recipes/couscous.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("does not overwrite existing canonicalLocale", async () => {
    await writeMeta("recipes/miso-ramen.meta.json", { canonicalLocale: "de", locale: "en" });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("recipes/miso-ramen.meta.json");
    expect(meta.canonicalLocale).toBe("de");
  });
});

describe("backfillCanonicalLocale — mixtures", () => {
  test("sets canonicalLocale from locale field", async () => {
    await writeMeta("mixtures/berbere.meta.json", { locale: "en", kind: "spicemix" });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("mixtures/berbere.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("defaults to en when no locale info present", async () => {
    await writeMeta("mixtures/mojo-rojo.meta.json", { kind: "sauce" });
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("mixtures/mojo-rojo.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });
});

describe("backfillCanonicalLocale — pairings excluded", () => {
  test("does not touch pairing meta files", async () => {
    const original = { descriptions: { en: "pairs well" } };
    await writeMeta("pairings/caraway--cumin.meta.json", original);
    await backfillCanonicalLocale(contentRoot);
    const meta = await readMeta("pairings/caraway--cumin.meta.json");
    expect(meta.canonicalLocale).toBeUndefined();
    expect(meta).toEqual(original);
  });
});

describe("backfillCanonicalLocale — stale queue stays empty", () => {
  test("does not add translationStaleSince to any entry", async () => {
    await writeMeta("ingredients/en/caraway.meta.json", { region: [] });
    await writeMeta("recipes/miso-ramen.meta.json", { locale: "en" });
    await writeMeta("mixtures/berbere.meta.json", { locale: "en" });
    await backfillCanonicalLocale(contentRoot);
    for (const path of [
      "ingredients/en/caraway.meta.json",
      "recipes/miso-ramen.meta.json",
      "mixtures/berbere.meta.json",
    ]) {
      const meta = await readMeta(path);
      expect(meta.translationStaleSince).toBeUndefined();
    }
  });

  test("does not add canonicalContentHash to any entry", async () => {
    await writeMeta("ingredients/en/caraway.meta.json", { region: [] });
    await writeMeta("recipes/miso-ramen.meta.json", { locale: "en" });
    await backfillCanonicalLocale(contentRoot);
    for (const path of ["ingredients/en/caraway.meta.json", "recipes/miso-ramen.meta.json"]) {
      const meta = await readMeta(path);
      expect(meta.canonicalContentHash).toBeUndefined();
    }
  });
});

describe("backfillCanonicalLocale — stats", () => {
  test("returns correct updated/skipped counts", async () => {
    await writeMeta("ingredients/en/caraway.meta.json", { region: [] });
    await writeMeta("ingredients/en/cumin.meta.json", { canonicalLocale: "en" });
    await writeMeta("recipes/miso-ramen.meta.json", { locale: "en" });
    const stats = await backfillCanonicalLocale(contentRoot);
    expect(stats.updated).toBe(2);
    expect(stats.skipped).toBe(1);
  });
});
