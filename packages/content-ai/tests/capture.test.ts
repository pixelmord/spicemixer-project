import { describe, expect, test, beforeEach, afterEach } from "vite-plus/test";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { capture } from "../evals/capture.ts";

async function makeSourceStore(
  dir: string,
  binaryHash: string,
  opts: {
    capability: string;
    traceId: string;
    recipe?: Record<string, unknown>;
    text?: string;
    textStrategy?: string;
    binaryMeta?: Record<string, unknown>;
  },
) {
  const binaryDir = join(dir, binaryHash);
  const structuredDir = join(binaryDir, "structured");
  const textDir = join(binaryDir, "text");

  await mkdir(structuredDir, { recursive: true });
  await mkdir(textDir, { recursive: true });

  await writeFile(
    join(binaryDir, "source.meta.json"),
    JSON.stringify(
      opts.binaryMeta ?? {
        kind: "text",
        mime: "text/plain",
        sizeBytes: 50,
        uploadedAt: "2026-01-01T00:00:00Z",
      },
    ),
  );

  const meta = {
    capability: opts.capability,
    model: "gpt-4o-mini",
    traceId: opts.traceId,
    at: "2026-01-01T00:00:00Z",
  };
  await writeFile(join(structuredDir, `${opts.traceId}.meta.json`), JSON.stringify(meta));
  const data = opts.recipe ?? {
    name: "Test Recipe",
    recipeIngredient: [],
    recipeInstructions: [],
    recipeYield: "2",
  };
  await writeFile(join(structuredDir, `${opts.traceId}.json`), JSON.stringify(data));

  if (opts.text !== undefined) {
    const strategy = opts.textStrategy ?? "direct-1";
    await writeFile(join(textDir, `${strategy}.txt`), opts.text);
  }
}

describe("capture", () => {
  let tmpDir: string;
  let sourceStore: string;
  let output: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "capture-test-"));
    sourceStore = join(tmpDir, "sources");
    output = join(tmpDir, "manifest.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("writes empty manifest when source store directory is missing", async () => {
    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(0);
    const written = JSON.parse(await readFile(output, "utf8"));
    expect(written.cases).toHaveLength(0);
    expect(typeof written.capturedAt).toBe("string");
  });

  test("promotes aiExtractRecipe artifact with direct text input", async () => {
    await mkdir(sourceStore, { recursive: true });
    const inputText = "Pasta Aglio e Olio\nServes: 2\n1 cup pasta\nBoil pasta.";
    const recipe = { name: "Pasta Aglio e Olio", recipeIngredient: ["1 cup pasta"] };
    await makeSourceStore(sourceStore, "hash01", {
      capability: "aiExtractRecipe",
      traceId: "trace-01",
      recipe,
      text: inputText,
      textStrategy: "direct-1",
    });

    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(1);
    const c = manifest.cases[0];
    expect(c.traceId).toBe("trace-01");
    expect(c.binaryHash).toBe("hash01");
    expect(c.capability).toBe("aiExtractRecipe");
    expect(c.input).toBe(inputText);
    expect(c.expected).toEqual(recipe);
    expect(c.textStrategy).toBe("direct-1");
  });

  test("ignores artifacts with other capabilities", async () => {
    await mkdir(sourceStore, { recursive: true });
    await makeSourceStore(sourceStore, "hash02", {
      capability: "aiExtractIngredient",
      traceId: "trace-02",
      text: "some text",
    });

    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(0);
  });

  test("skips artifacts without any text input", async () => {
    await mkdir(sourceStore, { recursive: true });
    const binaryHash = "hash03";
    const traceId = "trace-03";
    const binaryDir = join(sourceStore, binaryHash);
    const structuredDir = join(binaryDir, "structured");

    await mkdir(structuredDir, { recursive: true });
    await writeFile(
      join(binaryDir, "source.meta.json"),
      JSON.stringify({
        kind: "image",
        mime: "image/png",
        sizeBytes: 1000,
        uploadedAt: "2026-01-01T00:00:00Z",
      }),
    );
    await writeFile(
      join(structuredDir, `${traceId}.meta.json`),
      JSON.stringify({
        capability: "aiExtractRecipe",
        model: "gpt-4o",
        traceId,
        at: "2026-01-01T00:00:00Z",
      }),
    );
    await writeFile(
      join(structuredDir, `${traceId}.json`),
      JSON.stringify({ name: "Vision Recipe" }),
    );

    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(0);
  });

  test("skips artifacts missing binary meta", async () => {
    await mkdir(sourceStore, { recursive: true });
    const binaryHash = "hash04";
    const traceId = "trace-04";
    const binaryDir = join(sourceStore, binaryHash);
    const structuredDir = join(binaryDir, "structured");

    await mkdir(structuredDir, { recursive: true });
    // No source.meta.json
    await writeFile(
      join(structuredDir, `${traceId}.meta.json`),
      JSON.stringify({
        capability: "aiExtractRecipe",
        model: "gpt-4o",
        traceId,
        at: "2026-01-01T00:00:00Z",
      }),
    );
    await writeFile(join(structuredDir, `${traceId}.json`), JSON.stringify({ name: "Orphan" }));

    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(0);
  });

  test("prefers direct text over pdfjs when both exist", async () => {
    await mkdir(sourceStore, { recursive: true });
    const binaryHash = "hash05";
    const binaryDir = join(sourceStore, binaryHash);
    const structuredDir = join(binaryDir, "structured");
    const textDir = join(binaryDir, "text");

    await mkdir(structuredDir, { recursive: true });
    await mkdir(textDir, { recursive: true });
    await writeFile(
      join(binaryDir, "source.meta.json"),
      JSON.stringify({
        kind: "pdf",
        mime: "application/pdf",
        sizeBytes: 500,
        uploadedAt: "2026-01-01T00:00:00Z",
      }),
    );
    await writeFile(
      join(structuredDir, "trace-05.meta.json"),
      JSON.stringify({
        capability: "aiExtractRecipe",
        model: "gpt-4o",
        traceId: "trace-05",
        at: "2026-01-01T00:00:00Z",
      }),
    );
    await writeFile(join(structuredDir, "trace-05.json"), JSON.stringify({ name: "PDF Recipe" }));
    await writeFile(join(textDir, "direct-1.txt"), "direct text");
    await writeFile(join(textDir, "pdfjs-5.txt"), "pdfjs text");

    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(1);
    expect(manifest.cases[0].input).toBe("direct text");
    expect(manifest.cases[0].textStrategy).toBe("direct-1");
  });

  test("falls back to pdfjs when no direct text", async () => {
    await mkdir(sourceStore, { recursive: true });
    const binaryHash = "hash06";
    await makeSourceStore(sourceStore, binaryHash, {
      capability: "aiExtractRecipe",
      traceId: "trace-06",
      text: "pdf extracted text",
      textStrategy: "pdfjs-5",
    });

    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(1);
    expect(manifest.cases[0].input).toBe("pdf extracted text");
    expect(manifest.cases[0].textStrategy).toBe("pdfjs-5");
  });

  test("collects multiple cases across different binary hashes", async () => {
    await mkdir(sourceStore, { recursive: true });
    for (let i = 0; i < 3; i++) {
      await makeSourceStore(sourceStore, `hash-multi-${i}`, {
        capability: "aiExtractRecipe",
        traceId: `trace-multi-${i}`,
        text: `Recipe text ${i}`,
      });
    }

    const manifest = await capture({ sourceStore, output });
    expect(manifest.cases).toHaveLength(3);
    expect(manifest.cases.map((c) => c.traceId).sort()).toEqual([
      "trace-multi-0",
      "trace-multi-1",
      "trace-multi-2",
    ]);
  });

  test("manifest includes sourceStore and capturedAt", async () => {
    await mkdir(sourceStore, { recursive: true });
    const manifest = await capture({ sourceStore, output });
    expect(typeof manifest.capturedAt).toBe("string");
    expect(manifest.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof manifest.sourceStore).toBe("string");
  });
});
