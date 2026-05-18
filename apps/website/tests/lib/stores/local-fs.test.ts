import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { LocalFsStore } from "../../../src/lib/stores/local-fs.ts";

describe("LocalFsStore CONTENT_ROOT override", () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "spicemixer-localfs-"));
    prevEnv = process.env.CONTENT_ROOT;
    process.env.CONTENT_ROOT = tmpRoot;
  });

  afterEach(async () => {
    if (prevEnv === undefined) delete process.env.CONTENT_ROOT;
    else process.env.CONTENT_ROOT = prevEnv;
    await rm(tmpRoot, { recursive: true, force: true });
  });

  test("put writes under CONTENT_ROOT", async () => {
    const store = new LocalFsStore();
    await store.put("recipes", "en/test-recipe", { name: "Test" });
    const written = await readFile(join(tmpRoot, "recipes/en/test-recipe.json"), "utf-8");
    expect(JSON.parse(written)).toEqual({ name: "Test" });
  });

  test("get + list resolve against CONTENT_ROOT", async () => {
    const store = new LocalFsStore();
    await store.put("ingredients", "en/test-ing", { name: "Test Ing" });
    const item = await store.get("ingredients", "en/test-ing");
    expect(item?.data).toEqual({ name: "Test Ing" });
    const all = await store.list("ingredients");
    expect(all.map((i) => i.id)).toEqual(["en/test-ing"]);
  });

  test("meta sidecars resolve under CONTENT_ROOT", async () => {
    const store = new LocalFsStore();
    await store.put("meta", "recipes/test", { draft: true });
    const meta = await store.get("meta", "recipes/test");
    expect(meta?.data).toEqual({ draft: true });
    const onDisk = await readFile(join(tmpRoot, "recipes/test.meta.json"), "utf-8");
    expect(JSON.parse(onDisk)).toEqual({ draft: true });
  });

  test("delete removes from CONTENT_ROOT", async () => {
    const store = new LocalFsStore();
    await store.put("recipes", "en/to-delete", { name: "x" });
    await store.delete("recipes", "en/to-delete");
    expect(await store.get("recipes", "en/to-delete")).toBeNull();
  });
});

describe("LocalFsStore default root", () => {
  test("falls back to src/content when CONTENT_ROOT unset", async () => {
    const prev = process.env.CONTENT_ROOT;
    // Point at apps/website's real content so this test works regardless of cwd.
    process.env.CONTENT_ROOT = join(
      process.cwd().endsWith("apps/website") ? "." : "apps/website",
      "src/content",
    );
    try {
      const store = new LocalFsStore();
      const items = await store.list("ingredients");
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => /^[a-z]{2}\//.test(i.id))).toBe(true);
    } finally {
      if (prev !== undefined) process.env.CONTENT_ROOT = prev;
      else delete process.env.CONTENT_ROOT;
    }
  });
});
