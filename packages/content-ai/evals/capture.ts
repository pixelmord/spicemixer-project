import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { StructuredMeta } from "../src/source-store/types.ts";

export interface CaptureCase {
  traceId: string;
  binaryHash: string;
  capability: string;
  model: string;
  at: string;
  input: string;
  expected: unknown;
  textStrategy: string;
}

export interface CaptureManifest {
  capturedAt: string;
  sourceStore: string;
  cases: CaptureCase[];
}

async function readJsonSafe<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

const TEXT_PRIORITY = ["direct-1", "pdfjs-5"];

async function findTextInput(
  textDir: string,
): Promise<{ input: string; textStrategy: string } | null> {
  if (!existsSync(textDir)) return null;

  let entries: string[];
  try {
    entries = await readdir(textDir);
  } catch {
    return null;
  }

  const txtFiles = entries.filter((e) => e.endsWith(".txt"));

  for (const preferred of TEXT_PRIORITY) {
    const match = `${preferred}.txt`;
    if (txtFiles.includes(match)) {
      const text = await readFile(join(textDir, match), "utf8");
      return { input: text, textStrategy: preferred };
    }
  }

  if (txtFiles.length > 0) {
    const name = txtFiles[0];
    const text = await readFile(join(textDir, name), "utf8");
    return { input: text, textStrategy: name.replace(/\.txt$/, "") };
  }

  return null;
}

export async function capture(options: {
  sourceStore: string;
  output: string;
}): Promise<CaptureManifest> {
  const { sourceStore, output } = options;
  const cases: CaptureCase[] = [];

  let binaryHashes: string[];
  try {
    binaryHashes = await readdir(sourceStore);
  } catch {
    binaryHashes = [];
  }

  for (const binaryHash of binaryHashes) {
    const binaryDir = join(sourceStore, binaryHash);
    const structuredDir = join(binaryDir, "structured");

    if (!existsSync(structuredDir)) continue;

    const binaryMeta = await readJsonSafe(join(binaryDir, "source.meta.json"));
    if (!binaryMeta) continue;

    let entries: string[];
    try {
      entries = await readdir(structuredDir);
    } catch {
      continue;
    }

    const metaFiles = entries.filter((e) => e.endsWith(".meta.json"));

    for (const metaFile of metaFiles) {
      const meta = await readJsonSafe<StructuredMeta>(join(structuredDir, metaFile));
      if (!meta) continue;
      if (meta.capability !== "aiExtractRecipe") continue;

      const traceId = meta.traceId;
      const dataFile = metaFile.replace(/\.meta\.json$/, ".json");
      const expected = await readJsonSafe(join(structuredDir, dataFile));
      if (!expected) continue;

      const textResult = await findTextInput(join(binaryDir, "text"));
      if (!textResult) continue;

      cases.push({
        traceId,
        binaryHash,
        capability: meta.capability,
        model: meta.model,
        at: meta.at,
        input: textResult.input,
        expected,
        textStrategy: textResult.textStrategy,
      });
    }
  }

  const manifest: CaptureManifest = {
    capturedAt: new Date().toISOString(),
    sourceStore: resolve(sourceStore),
    cases,
  };

  await writeFile(output, JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? "")) {
  const args = process.argv.slice(2);

  const sourceStoreIdx = args.indexOf("--source-store");
  const outputIdx = args.indexOf("--output");

  const dir = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
  const sourceStore =
    sourceStoreIdx !== -1
      ? args[sourceStoreIdx + 1]
      : join(dir, "../../../apps/website/data/sources");
  const output = outputIdx !== -1 ? args[outputIdx + 1] : join(dir, "capture-manifest.json");

  capture({ sourceStore, output })
    .then((manifest) => {
      console.log(`Captured ${manifest.cases.length} eval case(s) → ${output}`);
    })
    .catch((err: unknown) => {
      console.error("Capture failed:", err);
      process.exit(1);
    });
}
