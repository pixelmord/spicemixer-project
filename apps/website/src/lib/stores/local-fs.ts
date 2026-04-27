import { readdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Collection, ContentItem, ContentStore } from "../content-store.ts";

// Resolve src/content/ relative to this file at runtime.
const CONTENT_ROOT = join(fileURLToPath(import.meta.url), "../../../../content");

/** Map a collection + id to an absolute file path. */
function idToPath(collection: Collection, id: string): string {
  return join(CONTENT_ROOT, collection, ...id.split("/")) + ".json";
}

export class LocalFsStore implements ContentStore {
  async list(collection: Collection): Promise<ContentItem[]> {
    const dir = join(CONTENT_ROOT, collection);
    const items: ContentItem[] = [];
    await this.#walkDir(dir, collection, items, dir);
    return items;
  }

  async #walkDir(
    dir: string,
    collection: Collection,
    acc: ContentItem[],
    base: string,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist yet
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.#walkDir(full, collection, acc, base);
      } else if (entry.name.endsWith(".json")) {
        const id = full.slice(base.length + 1).replace(/\.json$/, "");
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
