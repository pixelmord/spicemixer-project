import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { existsSync } from "node:fs";
import type { SourceStore } from "./index.ts";
import type { BinaryMeta, TextMeta, StructuredMeta } from "./types.ts";
import { hashBinary } from "./ids.ts";

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function extFromMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? "bin";
}

export class LocalSourceStore implements SourceStore {
  constructor(private readonly basePath: string) {}

  async putBinary(bytes: Uint8Array, meta: BinaryMeta): Promise<{ binaryHash: string }> {
    const binaryHash = hashBinary(bytes);
    const dir = join(this.basePath, binaryHash);
    await mkdir(dir, { recursive: true });

    const ext = meta.filename
      ? extname(meta.filename).slice(1) || extFromMime(meta.mime)
      : extFromMime(meta.mime);
    const binPath = join(dir, `source.${ext}`);

    if (!existsSync(binPath)) {
      await writeFile(binPath, bytes);
    }
    await writeFile(join(dir, "source.meta.json"), JSON.stringify(meta, null, 2));

    return { binaryHash };
  }

  async putText(
    binaryHash: string,
    strategy: string,
    version: string,
    text: string,
    meta: Omit<TextMeta, "strategy" | "version">,
  ): Promise<void> {
    const textDir = join(this.basePath, binaryHash, "text");
    await mkdir(textDir, { recursive: true });

    const stem = `${strategy}-${version}`;
    await writeFile(join(textDir, `${stem}.txt`), text, "utf8");
    await writeFile(
      join(textDir, `${stem}.meta.json`),
      JSON.stringify({ ...meta, strategy, version }, null, 2),
    );
  }

  async putStructured(
    binaryHash: string,
    traceId: string,
    data: unknown,
    meta: Omit<StructuredMeta, "traceId">,
  ): Promise<void> {
    const structDir = join(this.basePath, binaryHash, "structured");
    await mkdir(structDir, { recursive: true });

    await writeFile(join(structDir, `${traceId}.json`), JSON.stringify(data, null, 2));
    await writeFile(
      join(structDir, `${traceId}.meta.json`),
      JSON.stringify({ ...meta, traceId }, null, 2),
    );
  }

  async readBinary(binaryHash: string): Promise<Uint8Array | null> {
    const dir = join(this.basePath, binaryHash);
    if (!existsSync(dir)) return null;

    for (const ext of new Set(Object.values(MIME_TO_EXT))) {
      const p = join(dir, `source.${ext}`);
      if (existsSync(p)) {
        const buf = await readFile(p);
        return new Uint8Array(buf);
      }
    }
    const binPath = join(dir, "source.bin");
    if (existsSync(binPath)) {
      const buf = await readFile(binPath);
      return new Uint8Array(buf);
    }
    return null;
  }

  async listForBinary(binaryHash: string): Promise<{ texts: string[]; structured: string[] }> {
    const dir = join(this.basePath, binaryHash);
    if (!existsSync(dir)) return { texts: [], structured: [] };

    const texts: string[] = [];
    const textDir = join(dir, "text");
    if (existsSync(textDir)) {
      const entries = await readdir(textDir);
      for (const entry of entries) {
        if (entry.endsWith(".txt")) {
          texts.push(entry.slice(0, -4)); // strip .txt
        }
      }
    }

    const structured: string[] = [];
    const structDir = join(dir, "structured");
    if (existsSync(structDir)) {
      const entries = await readdir(structDir);
      for (const entry of entries) {
        if (entry.endsWith(".json") && !entry.endsWith(".meta.json")) {
          structured.push(entry.slice(0, -5)); // strip .json
        }
      }
    }

    return { texts, structured };
  }
}
