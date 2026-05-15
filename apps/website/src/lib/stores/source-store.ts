import { LocalSourceStore } from "content-ai";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export function createSourceStore() {
  return new LocalSourceStore(join(process.cwd(), "data/sources"));
}

export interface SourceBinaryMeta {
  mime: string;
  filename?: string;
}

export async function readSourceBinaryMeta(binaryHash: string): Promise<SourceBinaryMeta | null> {
  const metaPath = join(process.cwd(), "data/sources", binaryHash, "source.meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(await readFile(metaPath, "utf8")) as {
      mime?: string;
      filename?: string;
    };
    return { mime: raw.mime ?? "application/octet-stream", filename: raw.filename };
  } catch {
    return null;
  }
}
