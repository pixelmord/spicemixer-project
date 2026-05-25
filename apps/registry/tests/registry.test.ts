/// <reference types="vite-plus/test/globals" />
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(REGISTRY_ROOT, "public");

describe("registry.json", () => {
  let manifest: { name: string; homepage?: string; items: unknown[] };

  beforeAll(async () => {
    const raw = await readFile(join(PUBLIC, "registry.json"), "utf-8");
    manifest = JSON.parse(raw);
  });

  test("has required name field", () => {
    expect(typeof manifest.name).toBe("string");
    expect(manifest.name.length).toBeGreaterThan(0);
  });

  test("has items array", () => {
    expect(Array.isArray(manifest.items)).toBe(true);
  });

  test("every item has name, type starting with registry:, and files array", () => {
    for (const item of manifest.items) {
      expect(item).toMatchObject({
        name: expect.any(String),
        type: expect.stringMatching(/^registry:/),
        files: expect.any(Array),
      });
    }
  });

  test("__hello-world__ is listed in items", () => {
    const names = (manifest.items as Array<{ name: string }>).map((i) => i.name);
    expect(names).toContain("__hello-world__");
  });
});

describe("r/ item files", () => {
  let item: {
    name: string;
    type: string;
    files: Array<{ path: string; type: string; content: string }>;
  };

  beforeAll(async () => {
    const raw = await readFile(join(PUBLIC, "r", "__hello-world__.json"), "utf-8");
    item = JSON.parse(raw);
  });

  test("__hello-world__ has valid structure", () => {
    expect(item).toMatchObject({
      name: "__hello-world__",
      type: expect.stringMatching(/^registry:/),
      files: expect.any(Array),
    });
  });

  test("__hello-world__ files[0] has path, type, and non-empty content", () => {
    const file = item.files[0];
    expect(file).toBeDefined();
    expect(typeof file.path).toBe("string");
    expect(file.type).toMatch(/^registry:/);
    expect(typeof file.content).toBe("string");
    expect(file.content.length).toBeGreaterThan(0);
  });

  test("__hello-world__ content exports a React component", () => {
    const content = item.files[0]?.content ?? "";
    expect(content).toContain("export function");
    expect(content).toMatch(/className|class/);
  });

  test("every manifest item has a corresponding r/<name>.json file", async () => {
    const registryRaw = await readFile(join(PUBLIC, "registry.json"), "utf-8");
    const { items } = JSON.parse(registryRaw) as { items: Array<{ name: string }> };
    const rFiles = await readdir(join(PUBLIC, "r"));
    for (const entry of items) {
      expect(rFiles).toContain(`${entry.name}.json`);
    }
  });
});

describe("stack assumptions documented in index page", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(REGISTRY_ROOT, "src", "pages", "index.astro"), "utf-8");
  });

  test("mentions React 19", () => {
    expect(src).toMatch(/React\s*19/);
  });

  test("mentions Tailwind v4", () => {
    expect(src).toMatch(/Tailwind\s*v?4/i);
  });

  test("mentions shadcn", () => {
    expect(src.toLowerCase()).toContain("shadcn");
  });

  test("includes CLI usage example with shadcn add", () => {
    expect(src).toContain("shadcn");
    expect(src).toMatch(/dlx shadcn|shadcn add/i);
  });
});
