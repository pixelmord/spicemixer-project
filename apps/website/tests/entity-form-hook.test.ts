import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOOKS = join(WEBSITE_ROOT, "src", "hooks");
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

describe("useEntityFormState hook — module structure", () => {
  let hookSrc: string;

  beforeAll(async () => {
    hookSrc = await readFile(join(HOOKS, "useEntityFormState.ts"), "utf-8");
  });

  test("useEntityFormState is exported", () => {
    expect(hookSrc).toMatch(/^export function useEntityFormState\(/m);
  });

  test("UseEntityFormStateOpts interface is exported", () => {
    expect(hookSrc).toMatch(/^export interface UseEntityFormStateOpts/m);
  });

  test("UseEntityFormStateReturn interface is exported", () => {
    expect(hookSrc).toMatch(/^export interface UseEntityFormStateReturn/m);
  });

  test("hook returns slug, draft, saving, locale, localeReady, completeness", () => {
    // Return shape must contain these keys
    expect(hookSrc).toMatch(/slug[,\s]/);
    expect(hookSrc).toMatch(/draft[,\s]/);
    expect(hookSrc).toMatch(/saving[,\s]/);
    expect(hookSrc).toMatch(/locale[,\s]/);
    expect(hookSrc).toMatch(/localeReady[,\s]/);
    expect(hookSrc).toMatch(/completeness[,\s]/);
  });

  test("hook includes debounced slug availability check", () => {
    expect(hookSrc).toMatch(/checkSlugAvailable/);
    expect(hookSrc).toMatch(/setTimeout/);
  });

  test("pairing kind skips slug check", () => {
    expect(hookSrc).toMatch(/kind.*pairing|pairing.*kind/);
  });

  test("localeReady is true for pairing unconditionally", () => {
    // The ADR 0009 locale-required guard exempts pairings
    expect(hookSrc).toMatch(/pairing.*true|localeReady.*pairing/);
  });
});

describe("RecipeForm — binds useEntityFormState", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "recipe", "RecipeForm.tsx"), "utf-8");
  });

  test("imports useEntityFormState", () => {
    expect(src).toMatch(/useEntityFormState/);
  });

  test("does not declare slug state inline", () => {
    // After wiring the hook, slug state should not be re-declared locally
    expect(src).not.toMatch(/useState\(initialSlug/);
  });

  test("does not declare draft state inline", () => {
    expect(src).not.toMatch(/useState\(.*draft.*isNew\)|useState.*isNew.*draft/);
  });
});

describe("IngredientForm — binds useEntityFormState", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "ingredient", "IngredientForm.tsx"), "utf-8");
  });

  test("imports useEntityFormState", () => {
    expect(src).toMatch(/useEntityFormState/);
  });

  test("does not declare slug state inline", () => {
    expect(src).not.toMatch(/useState\(initialSlug/);
  });
});

describe("PairingForm — binds useEntityFormState", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "pairing", "PairingForm.tsx"), "utf-8");
  });

  test("imports useEntityFormState", () => {
    expect(src).toMatch(/useEntityFormState/);
  });
});

describe("PairingForm — uses @tanstack/react-form", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "forms", "pairing", "PairingForm.tsx"), "utf-8");
  });

  test("imports useForm from @tanstack/react-form", () => {
    expect(src).toMatch(/@tanstack\/react-form/);
  });

  test("does not declare ingredient1 as useState", () => {
    expect(src).not.toMatch(/useState\(initialIngredients/);
  });

  test("does not declare descriptions as useState", () => {
    expect(src).not.toMatch(/useState<Record<string, string>>\(initialDescriptions/);
  });

  test("does not declare image as useState(initialImage)", () => {
    expect(src).not.toMatch(/useState\(initialImage\)/);
  });

  test("calls form.handleSubmit on save", () => {
    expect(src).toMatch(/form\.handleSubmit/);
  });
});
