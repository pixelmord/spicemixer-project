import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrateCollection } from "../../scripts/migrate-locale-storage.ts";

let collectionDir: string;

beforeEach(async () => {
  collectionDir = await mkdtemp(join(tmpdir(), "spicemixer-locale-migration-test-"));
});

afterEach(async () => {
  await rm(collectionDir, { recursive: true, force: true });
});

async function writeFile_(path: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(join(collectionDir, path), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(join(collectionDir, path));
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(collectionDir, path), "utf-8")) as Record<string, unknown>;
}

describe("migrateCollection — basic moves", () => {
  test("moves a flat recipe to locale subfolder using meta locale field", async () => {
    await writeFile_("miso-ramen.json", { name: "Miso Ramen" });
    await writeFile_("miso-ramen.meta.json", { locale: "en", draft: false });

    await migrateCollection(collectionDir);

    expect(await exists("en/miso-ramen.json")).toBe(true);
    expect(await exists("en/miso-ramen.meta.json")).toBe(true);
    expect(await exists("miso-ramen.json")).toBe(false);
    expect(await exists("miso-ramen.meta.json")).toBe(false);
  });

  test("moves both content and meta files together", async () => {
    await writeFile_("harissa.json", { name: "Harissa" });
    await writeFile_("harissa.meta.json", { locale: "en", kind: "sauce" });

    await migrateCollection(collectionDir);

    const meta = await readJson("en/harissa.meta.json");
    expect(meta.locale).toBe("en");
    expect(meta.kind).toBe("sauce");
  });

  test("falls back to language field when locale is absent", async () => {
    await writeFile_("berbere.json", { name: "Berbere" });
    await writeFile_("berbere.meta.json", { language: "de", kind: "spicemix" });

    await migrateCollection(collectionDir);

    expect(await exists("de/berbere.json")).toBe(true);
    expect(await exists("de/berbere.meta.json")).toBe(true);
  });

  test("defaults to en when neither locale nor language is present", async () => {
    await writeFile_("ras-el-hanout.json", { name: "Ras el Hanout" });
    await writeFile_("ras-el-hanout.meta.json", { kind: "spicemix" });

    await migrateCollection(collectionDir);

    expect(await exists("en/ras-el-hanout.json")).toBe(true);
  });

  test("defaults to en when no meta file exists", async () => {
    await writeFile_("no-meta.json", { name: "No Meta" });

    await migrateCollection(collectionDir);

    expect(await exists("en/no-meta.json")).toBe(true);
  });
});

describe("migrateCollection — idempotency", () => {
  test("skips files already in a locale subfolder", async () => {
    await mkdir(join(collectionDir, "en"), { recursive: true });
    await writeFile_("en/miso-ramen.json", { name: "Miso Ramen" });
    await writeFile_("en/miso-ramen.meta.json", { locale: "en" });

    const { moved } = await migrateCollection(collectionDir);

    expect(moved).toBe(0);
  });

  test("running twice has no side effects", async () => {
    await writeFile_("tomato-confit.json", { name: "Tomato Confit" });
    await writeFile_("tomato-confit.meta.json", { locale: "en" });

    await migrateCollection(collectionDir);
    const { moved: secondRun } = await migrateCollection(collectionDir);

    expect(secondRun).toBe(0);
    expect(await exists("en/tomato-confit.json")).toBe(true);
  });
});

describe("migrateCollection — multiple files", () => {
  test("migrates multiple recipes in one pass", async () => {
    await writeFile_("recipe-a.json", { name: "A" });
    await writeFile_("recipe-a.meta.json", { locale: "en" });
    await writeFile_("recipe-b.json", { name: "B" });
    await writeFile_("recipe-b.meta.json", { locale: "de" });

    const { moved } = await migrateCollection(collectionDir);

    expect(await exists("en/recipe-a.json")).toBe(true);
    expect(await exists("de/recipe-b.json")).toBe(true);
    expect(moved).toBe(4);
  });

  test("returns correct moved count (content + meta per entry)", async () => {
    await writeFile_("a.json", { name: "A" });
    await writeFile_("a.meta.json", { locale: "en" });

    const { moved } = await migrateCollection(collectionDir);
    expect(moved).toBe(2);
  });
});

describe("migrateCollection — does not touch meta.json files directly", () => {
  test("does not move *.meta.json as top-level content (only via pair)", async () => {
    await writeFile_("orphan.meta.json", { locale: "en" });

    const { moved } = await migrateCollection(collectionDir);

    expect(moved).toBe(0);
    expect(await exists("orphan.meta.json")).toBe(true);
  });
});
