import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LAYOUTS = join(WEBSITE_ROOT, "src", "layouts");
const STYLES = join(WEBSITE_ROOT, "src", "styles");
const COMPONENTS = join(WEBSITE_ROOT, "src", "components");
const PAGES = join(WEBSITE_ROOT, "src", "pages");

// ── Pre-paint script ──────────────────────────────────────────────────────────

describe("pre-paint script: BaseLayout.astro", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(LAYOUTS, "BaseLayout.astro"), "utf-8");
  });

  test("contains an is:inline script in <head>", () => {
    // The pre-paint script must be inline (synchronous) to avoid FOUC.
    expect(src).toContain("is:inline");
  });

  test("reads spicemixer.viewMode from localStorage", () => {
    expect(src).toContain("spicemixer.viewMode");
  });

  test("sets data-mode='cook' on documentElement when value is 'cook'", () => {
    expect(src).toContain("data-mode");
    expect(src).toContain('"cook"');
  });

  test("wraps localStorage access in try/catch for graceful fallback", () => {
    // Verify try and catch both appear (in that order) in the inline script.
    const tryIdx = src.indexOf("try");
    const catchIdx = src.indexOf("catch");
    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(tryIdx);
  });

  test("imports cook-mode.css", () => {
    expect(src).toContain("cook-mode.css");
  });
});

// ── Cook-mode CSS layer ───────────────────────────────────────────────────────

describe("cook-mode.css: @layer cook rules", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(STYLES, "cook-mode.css"), "utf-8");
  });

  test("defines @layer cook", () => {
    expect(src).toContain("@layer cook");
  });

  test("hides [data-cook='hide'] elements when html has data-mode='cook'", () => {
    expect(src).toContain('[data-cook="hide"]');
    expect(src).toContain("display: none");
  });

  test("applies compact styles to [data-cook='compact'] elements", () => {
    expect(src).toContain('[data-cook="compact"]');
  });

  test("scopes hide rule to html[data-mode='cook']", () => {
    expect(src).toContain('html[data-mode="cook"]');
  });
});

// ── Print stylesheet ──────────────────────────────────────────────────────────

describe("print.css: @media print rules", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(STYLES, "print.css"), "utf-8");
  });

  test("defines @media print", () => {
    expect(src).toContain("@media print");
  });

  test("hides [data-cook='hide'] elements when printing", () => {
    expect(src).toContain('[data-cook="hide"]');
    expect(src).toContain("display: none");
  });

  test("applies compact styles to [data-cook='compact'] elements", () => {
    expect(src).toContain('[data-cook="compact"]');
  });
});

// ── CSS contract: cook-mode and print rules must not drift ────────────────────

describe("CSS contract: cook-mode and print rules share declarations", () => {
  let cookSrc: string;
  let printSrc: string;
  beforeAll(async () => {
    [cookSrc, printSrc] = await Promise.all([
      readFile(join(STYLES, "cook-mode.css"), "utf-8"),
      readFile(join(STYLES, "print.css"), "utf-8"),
    ]);
  });

  function extractDeclarations(css: string, selector: string): string {
    // Extract all { ... } blocks following the given selector text.
    const idx = css.indexOf(selector);
    if (idx === -1) return "";
    const open = css.indexOf("{", idx);
    const close = css.indexOf("}", open);
    if (open === -1 || close === -1) return "";
    return css
      .slice(open + 1, close)
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .sort()
      .join(";");
  }

  test("[data-cook='hide'] declarations are identical in both files", () => {
    const cookDecls = extractDeclarations(cookSrc, '[data-cook="hide"]');
    const printDecls = extractDeclarations(printSrc, '[data-cook="hide"]');
    expect(cookDecls).toBeTruthy();
    expect(printDecls).toBeTruthy();
    expect(cookDecls).toBe(printDecls);
  });

  test("[data-cook='compact'] declarations are identical in both files", () => {
    const cookDecls = extractDeclarations(cookSrc, '[data-cook="compact"]');
    const printDecls = extractDeclarations(printSrc, '[data-cook="compact"]');
    expect(cookDecls).toBeTruthy();
    expect(printDecls).toBeTruthy();
    expect(cookDecls).toBe(printDecls);
  });
});

// ── Mixture detail: data-cook annotations ────────────────────────────────────

describe("mixture detail: data-cook annotations (EN)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(PAGES, "mixtures", "[slug].astro"), "utf-8");
  });

  test("hero slot has data-cook='compact'", () => {
    expect(src).toContain('data-cook="compact"');
  });

  test("encyclopedia slot has data-cook='hide'", () => {
    expect(src).toContain('data-cook="hide"');
  });

  test("relations slot has data-cook='hide'", () => {
    // At least one hide annotation exists (already asserted above);
    // verify relations slot is annotated by confirming it occurs in the relations slot context.
    const relationsIdx = src.indexOf('slot="relations"');
    const hideAfterRelations = src.indexOf('data-cook="hide"', relationsIdx);
    expect(relationsIdx).toBeGreaterThan(-1);
    expect(hideAfterRelations).toBeGreaterThan(relationsIdx);
  });

  test("imports and renders CookModeToggle", () => {
    expect(src).toContain("CookModeToggle");
  });
});

describe("mixture detail: data-cook annotations (DE)", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(PAGES, "de", "mixtures", "[slug].astro"), "utf-8");
  });

  test("hero slot has data-cook='compact'", () => {
    expect(src).toContain('data-cook="compact"');
  });

  test("encyclopedia slot has data-cook='hide'", () => {
    expect(src).toContain('data-cook="hide"');
  });

  test("imports and renders CookModeToggle", () => {
    expect(src).toContain("CookModeToggle");
  });
});

// ── CookModeToggle component ──────────────────────────────────────────────────

describe("CookModeToggle component", () => {
  let src: string;
  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "CookModeToggle.tsx"), "utf-8");
  });

  test("imports subscribeViewMode from viewMode.ts", () => {
    expect(src).toContain("subscribeViewMode");
    expect(src).toContain("viewMode");
  });

  test("uses aria-pressed for ARIA state sync", () => {
    expect(src).toContain("aria-pressed");
  });

  test("calls toggleViewMode on click", () => {
    expect(src).toContain("toggleViewMode");
  });
});

// ── Scope contract: data-cook must NOT appear in excluded templates ────────────

describe("scope contract: data-cook absent from ingredient + list pages", () => {
  const EXCLUDED_FILES = [
    join(PAGES, "ingredients", "[slug].astro"),
    join(PAGES, "de", "ingredients", "[slug].astro"),
    join(PAGES, "index.astro"),
    join(PAGES, "de", "index.astro"),
    join(PAGES, "ingredients", "index.astro"),
    join(PAGES, "de", "ingredients", "index.astro"),
  ];

  for (const filePath of EXCLUDED_FILES) {
    const label = filePath.replace(PAGES + "/", "");
    test(`data-cook absent from ${label}`, async () => {
      let src: string;
      try {
        src = await readFile(filePath, "utf-8");
      } catch {
        return; // file doesn't exist yet — skip
      }
      expect(src).not.toContain("data-cook");
    });
  }
});
