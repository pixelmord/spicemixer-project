import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeRelationTaxonomyFields } from "../../scripts/migrate-relation-taxonomy.ts";

let contentRoot: string;

beforeEach(async () => {
  contentRoot = await mkdtemp(join(tmpdir(), "spicemixer-relation-taxonomy-test-"));
  await mkdir(join(contentRoot, "recipes", "en"), { recursive: true });
  await mkdir(join(contentRoot, "recipes", "de"), { recursive: true });
  await mkdir(join(contentRoot, "mixtures", "en"), { recursive: true });
  await mkdir(join(contentRoot, "mixtures", "de"), { recursive: true });
  await mkdir(join(contentRoot, "ingredients", "en"), { recursive: true });
  await mkdir(join(contentRoot, "ingredients", "de"), { recursive: true });
});

afterEach(async () => {
  await rm(contentRoot, { recursive: true, force: true });
});

async function writeJson(rel: string, data: object): Promise<void> {
  await writeFile(join(contentRoot, rel), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function readJson(rel: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(contentRoot, rel), "utf-8")) as Record<string, unknown>;
}

async function exists(rel: string): Promise<boolean> {
  try {
    await access(join(contentRoot, rel));
    return true;
  } catch {
    return false;
  }
}

describe("removeRelationTaxonomyFields — recipe meta", () => {
  test("removes goesWellWith from recipe meta", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      draft: false,
      region: ["north-africa"],
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("recipes/en/tagine.meta.json");
    expect(meta).not.toHaveProperty("goesWellWith");
    expect(meta.region).toEqual(["north-africa"]);
    expect(meta.canonicalLocale).toBe("en");
  });

  test("removes usesBase from recipe meta", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("recipes/en/tagine.meta.json");
    expect(meta).not.toHaveProperty("usesBase");
  });

  test("removes variantOf from recipe meta when present", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      variantOf: "tagine-classic",
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("recipes/en/tagine.meta.json");
    expect(meta).not.toHaveProperty("variantOf");
  });

  test("leaves variants field untouched", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: ["tagine-moroccan", "tagine-algerian"],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("recipes/en/tagine.meta.json");
    expect(meta.variants).toEqual(["tagine-moroccan", "tagine-algerian"]);
  });

  test("removes non-empty goesWellWith (schema deleted it)", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [{ collection: "mixtures", slug: "harissa" }],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("recipes/en/tagine.meta.json");
    expect(meta).not.toHaveProperty("goesWellWith");
  });

  test("skips recipe meta that already lacks all three fields", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      variants: [],
      canonicalLocale: "en",
    });

    const stats = await removeRelationTaxonomyFields(contentRoot);

    expect(stats.skipped).toBeGreaterThanOrEqual(1);
    const meta = await readJson("recipes/en/tagine.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("processes multiple recipe locales", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });
    await writeJson("recipes/de/tagine.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const enMeta = await readJson("recipes/en/tagine.meta.json");
    const deMeta = await readJson("recipes/de/tagine.meta.json");
    expect(enMeta).not.toHaveProperty("goesWellWith");
    expect(deMeta).not.toHaveProperty("goesWellWith");
  });
});

describe("removeRelationTaxonomyFields — mixture meta", () => {
  test("removes goesWellWith and usesBase from mixture meta", async () => {
    await writeJson("mixtures/en/harissa.meta.json", {
      draft: false,
      region: ["north-africa"],
      goesWellWith: [],
      usesBase: [],
      variants: [],
      kind: "sauce",
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("mixtures/en/harissa.meta.json");
    expect(meta).not.toHaveProperty("goesWellWith");
    expect(meta).not.toHaveProperty("usesBase");
    expect(meta.kind).toBe("sauce");
  });

  test("processes mixture de/ locale", async () => {
    await writeJson("mixtures/de/dukkah.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "de",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("mixtures/de/dukkah.meta.json");
    expect(meta).not.toHaveProperty("goesWellWith");
    expect(meta).not.toHaveProperty("usesBase");
  });
});

describe("removeRelationTaxonomyFields — ingredient content", () => {
  test("removes pairings from ingredient JSON when present", async () => {
    await writeJson("ingredients/en/cumin.json", {
      name: "Cumin",
      pairings: [],
      category: "spice",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const content = await readJson("ingredients/en/cumin.json");
    expect(content).not.toHaveProperty("pairings");
    expect(content.name).toBe("Cumin");
    expect(content.category).toBe("spice");
  });

  test("removes non-empty pairings from ingredient JSON", async () => {
    await writeJson("ingredients/en/cumin.json", {
      name: "Cumin",
      pairings: [{ slug: "caraway" }],
      category: "spice",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const content = await readJson("ingredients/en/cumin.json");
    expect(content).not.toHaveProperty("pairings");
  });

  test("skips ingredient JSON that lacks pairings", async () => {
    await writeJson("ingredients/en/cumin.json", {
      name: "Cumin",
      category: "spice",
    });

    const stats = await removeRelationTaxonomyFields(contentRoot);

    expect(stats.skipped).toBeGreaterThanOrEqual(1);
    const content = await readJson("ingredients/en/cumin.json");
    expect(content.name).toBe("Cumin");
  });

  test("does not touch ingredient meta files", async () => {
    await writeJson("ingredients/en/cumin.meta.json", {
      canonicalLocale: "en",
    });
    await writeJson("ingredients/en/cumin.json", {
      name: "Cumin",
      category: "spice",
    });

    await removeRelationTaxonomyFields(contentRoot);

    expect(await exists("ingredients/en/cumin.meta.json")).toBe(true);
    const meta = await readJson("ingredients/en/cumin.meta.json");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("processes ingredient de/ locale", async () => {
    await writeJson("ingredients/de/cumin.json", {
      name: "Kreuzkümmel",
      pairings: [],
      category: "spice",
    });

    await removeRelationTaxonomyFields(contentRoot);

    const content = await readJson("ingredients/de/cumin.json");
    expect(content).not.toHaveProperty("pairings");
  });
});

describe("removeRelationTaxonomyFields — idempotency", () => {
  test("running twice produces same final state", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);
    await removeRelationTaxonomyFields(contentRoot);

    const meta = await readJson("recipes/en/tagine.meta.json");
    expect(meta).not.toHaveProperty("goesWellWith");
    expect(meta).not.toHaveProperty("usesBase");
    expect(meta.canonicalLocale).toBe("en");
  });

  test("second run has updated=0", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    await removeRelationTaxonomyFields(contentRoot);
    const stats2 = await removeRelationTaxonomyFields(contentRoot);

    expect(stats2.updated).toBe(0);
  });
});

describe("removeRelationTaxonomyFields — stats", () => {
  test("counts updated correctly across collections", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });
    await writeJson("mixtures/en/harissa.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });
    await writeJson("ingredients/en/cumin.json", {
      name: "Cumin",
      pairings: [],
      category: "spice",
    });

    const stats = await removeRelationTaxonomyFields(contentRoot);

    expect(stats.updated).toBe(3);
  });

  test("counts skipped for files without target fields", async () => {
    await writeJson("recipes/en/tagine.meta.json", { variants: [], canonicalLocale: "en" });
    await writeJson("ingredients/en/cumin.json", { name: "Cumin", category: "spice" });

    const stats = await removeRelationTaxonomyFields(contentRoot);

    expect(stats.skipped).toBe(2);
    expect(stats.updated).toBe(0);
  });

  test("nonEmptyRemoved counts records with non-empty deleted fields", async () => {
    await writeJson("recipes/en/tagine.meta.json", {
      goesWellWith: [{ collection: "mixtures", slug: "harissa" }],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });
    await writeJson("recipes/en/couscous.meta.json", {
      goesWellWith: [],
      usesBase: [],
      variants: [],
      canonicalLocale: "en",
    });

    const stats = await removeRelationTaxonomyFields(contentRoot);

    expect(stats.nonEmptyRemoved).toBe(1);
  });
});
