import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIB_AI = join(WEBSITE_ROOT, "src", "lib", "ai");

describe("use-ingest-action — module contract", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-ingest-action.ts"), "utf-8");
  });

  test("exports useIngestAction function", () => {
    expect(src).toMatch(/export function useIngestAction\b/);
  });

  test("exports IngestActionOptions type", () => {
    expect(src).toMatch(/export type IngestActionOptions/);
  });

  test("exports UseIngestActionReturn interface or type", () => {
    expect(src).toMatch(/export (interface|type) UseIngestActionReturn/);
  });

  test("returns onRun handler matching IngestDialog contract", () => {
    expect(src).toMatch(/onRun.*SourceShape.*Promise<void>|onRun:.*=>/);
  });

  test("returns proposed state", () => {
    expect(src).toMatch(/proposed/);
  });

  test("returns warnings state", () => {
    expect(src).toMatch(/warnings/);
  });

  test("returns mergeModel state", () => {
    expect(src).toMatch(/mergeModel/);
  });

  test("returns clearProposed to reset state", () => {
    expect(src).toMatch(/clearProposed/);
  });
});

describe("use-ingest-action — FormData assembly per source kind", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-ingest-action.ts"), "utf-8");
  });

  test('appends sourceKind="file" for file source', () => {
    expect(src).toMatch(/"sourceKind".*"file"|"file".*sourceKind/);
  });

  test("appends file and mimeType for file source", () => {
    expect(src).toMatch(/append.*"file".*source\.file|source\.file/);
    expect(src).toMatch(/append.*"mimeType".*source\.mimeType|source\.mimeType/);
  });

  test('appends sourceKind="text" for text source', () => {
    expect(src).toMatch(/"sourceKind".*"text"|"text".*sourceKind/);
  });

  test("appends text content for text source", () => {
    expect(src).toMatch(/append.*"text".*source\.content|source\.content/);
  });

  test('appends sourceKind="prompt" for prompt source', () => {
    expect(src).toMatch(/"sourceKind".*"prompt"|"prompt".*sourceKind/);
  });

  test("appends prompt for prompt source", () => {
    expect(src).toMatch(/append.*"prompt".*source\.prompt|source\.prompt/);
  });

  test("appends existing entity data as JSON", () => {
    expect(src).toMatch(/append.*"existing".*JSON\.stringify/);
  });

  test("appends locale for pairing kind", () => {
    expect(src).toMatch(/append.*"locale".*locale/);
  });
});

describe("use-ingest-action — action dispatch per kind", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-ingest-action.ts"), "utf-8");
  });

  test("dispatches actions.aiMergeRecipe for recipe kind", () => {
    expect(src).toMatch(/actions\.aiMergeRecipe/);
  });

  test("dispatches actions.aiMergeIngredient for ingredient kind", () => {
    expect(src).toMatch(/actions\.aiMergeIngredient/);
  });

  test("dispatches actions.aiMergePairing for pairing kind", () => {
    expect(src).toMatch(/actions\.aiMergePairing/);
  });

  test("imports actions from astro:actions", () => {
    expect(src).toMatch(/from "astro:actions"/);
  });
});

describe("use-ingest-action — error handling parity with EnhanceModal", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-ingest-action.ts"), "utf-8");
  });

  test("surfaces errors via toast.error", () => {
    expect(src).toMatch(/toast\.error/);
  });

  test("imports toast from sonner", () => {
    expect(src).toMatch(/from "sonner"/);
  });

  test("re-throws error after toast so IngestDialog can handle phase reset", () => {
    expect(src).toMatch(/throw e/);
  });
});

describe("use-ingest-action — proposed data propagation", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(LIB_AI, "use-ingest-action.ts"), "utf-8");
  });

  test("sets proposed from data.recipe for recipe kind", () => {
    expect(src).toMatch(/data\.recipe/);
  });

  test("sets proposed from data.ingredient for ingredient kind", () => {
    expect(src).toMatch(/data\.ingredient/);
  });

  test("sets proposed from data.pairing for pairing kind", () => {
    expect(src).toMatch(/data\.pairing/);
  });

  test("handles pairing locale-keyed descriptions shape", () => {
    expect(src).toMatch(/descriptions/);
  });
});

describe("use-ingest-action — no astro:actions leak into registry", () => {
  test("registry source files do not import astro:actions", async () => {
    const { readdir } = await import("node:fs/promises");
    const registrySrc = join(WEBSITE_ROOT, "..", "..", "apps", "registry", "src");

    async function collectTsFiles(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await collectTsFiles(full)));
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
      return files;
    }

    const registryFiles = await collectTsFiles(registrySrc);
    for (const file of registryFiles) {
      const content = await readFile(file, "utf-8");
      expect(content, `${file} must not import astro:actions`).not.toMatch(/from "astro:actions"/);
    }
  });
});
