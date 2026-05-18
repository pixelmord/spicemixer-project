import { readdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { isAbsolute, join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Collection, ContentItem, ContentStore } from "../content-store.ts";

// process.cwd() is the Astro project root in both dev and SSR contexts.
// E2E tests redirect writes to a tmp dir by setting CONTENT_ROOT.
// Read lazily so tests can swap the env var per case.
function contentRoot(): string {
  const override = process.env.CONTENT_ROOT;
  if (!override) return join(process.cwd(), "src/content");
  return isAbsolute(override) ? override : join(process.cwd(), override);
}

const META_KIND_DIRS = ["recipes", "mixtures"] as const;

/** Map a collection + id to an absolute file path on disk. */
function idToPath(collection: Collection, id: string): string {
  switch (collection) {
    case "meta":
      // id "recipes/miso-butter-ramen" → recipes/miso-butter-ramen.meta.json
      return join(contentRoot(), ...id.split("/")) + ".meta.json";
    case "ingredientMeta":
      // id "en/cardamom" → ingredients/en/cardamom.meta.json
      return join(contentRoot(), "ingredients", ...id.split("/")) + ".meta.json";
    case "pairingMeta":
      // id "caraway--cumin" → pairings/caraway--cumin.meta.json
      return join(contentRoot(), "pairings", ...id.split("/")) + ".meta.json";
    default:
      return join(contentRoot(), collection, ...id.split("/")) + ".json";
  }
}

export class LocalFsStore implements ContentStore {
  async list(collection: Collection): Promise<ContentItem[]> {
    if (collection === "meta") {
      const items: ContentItem[] = [];
      for (const kind of META_KIND_DIRS) {
        const dir = join(contentRoot(), kind);
        await this.#walkDir(dir, collection, items, dir, {
          suffix: ".meta.json",
          idPrefix: `${kind}/`,
        });
      }
      return items;
    }

    if (collection === "ingredientMeta") {
      const dir = join(contentRoot(), "ingredients");
      const items: ContentItem[] = [];
      await this.#walkDir(dir, collection, items, dir, { suffix: ".meta.json" });
      return items;
    }

    if (collection === "pairingMeta") {
      const dir = join(contentRoot(), "pairings");
      const items: ContentItem[] = [];
      await this.#walkDir(dir, collection, items, dir, { suffix: ".meta.json" });
      return items;
    }

    const dir = join(contentRoot(), collection);
    const items: ContentItem[] = [];
    await this.#walkDir(dir, collection, items, dir, { suffix: ".json", excludeMeta: true });

    // All locale-bearing content collections (ingredients, recipes, mixtures) are
    // stored under locale subdirs (en/, de/) per ADR 0009. Skip stray root-level files.
    if (collection === "ingredients" || collection === "recipes" || collection === "mixtures") {
      return items.filter((item) => /^[a-z]{2}\//.test(item.id));
    }
    return items;
  }

  async #walkDir(
    dir: string,
    collection: Collection,
    acc: ContentItem[],
    base: string,
    opts: { suffix: ".json" | ".meta.json"; excludeMeta?: boolean; idPrefix?: string },
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.#walkDir(full, collection, acc, base, opts);
        continue;
      }
      if (!entry.name.endsWith(opts.suffix)) continue;
      if (opts.excludeMeta && entry.name.endsWith(".meta.json")) continue;
      const relWithoutSuffix = full.slice(base.length + 1, -opts.suffix.length);
      const id = (opts.idPrefix ?? "") + relWithoutSuffix;
      const raw = await readFile(full, "utf-8");
      const s = await stat(full);
      acc.push({
        collection,
        id,
        data: JSON.parse(raw) as unknown,
        updatedAt: s.mtime.toISOString(),
      });
    }
  }

  async get(collection: Collection, id: string): Promise<ContentItem | null> {
    const filePath = idToPath(collection, id);
    try {
      const raw = await readFile(filePath, "utf-8");
      const s = await stat(filePath);
      return { collection, id, data: JSON.parse(raw) as unknown, updatedAt: s.mtime.toISOString() };
    } catch {
      return null;
    }
  }

  async put(collection: Collection, id: string, data: unknown): Promise<void> {
    const filePath = idToPath(collection, id);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }

  async delete(collection: Collection, id: string): Promise<void> {
    const filePath = idToPath(collection, id);
    if (existsSync(filePath)) await unlink(filePath);
  }
}
