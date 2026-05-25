import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOOKS = join(WEBSITE_ROOT, "src", "hooks");

describe("useSplitViewPreference — module structure", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(HOOKS, "use-split-view-preference.ts"), "utf-8");
  });

  test("exports useSplitViewPreference function", () => {
    expect(src).toMatch(/export function useSplitViewPreference/);
  });

  test("uses the scoped localStorage key spicemixer.splitViewEnabled", () => {
    expect(src).toMatch(/spicemixer\.splitViewEnabled/);
  });

  test("reads from localStorage on initialisation", () => {
    expect(src).toMatch(/localStorage\.getItem/);
  });

  test("writes to localStorage when setter is called", () => {
    expect(src).toMatch(/localStorage\.setItem/);
  });

  test("returns a tuple of [boolean, setter]", () => {
    // Return type annotation or inferred return should be a two-element tuple
    expect(src).toMatch(/\[boolean,\s*\(v:\s*boolean\)/);
  });

  test("guards localStorage access in a try/catch", () => {
    expect(src).toMatch(/try\s*\{[\s\S]*localStorage/);
  });
});
