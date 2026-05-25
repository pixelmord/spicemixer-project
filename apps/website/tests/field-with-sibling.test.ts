import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

describe("FieldWithSibling — module structure", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "FieldWithSibling.tsx"), "utf-8");
  });

  test("exports FieldWithSibling component", () => {
    expect(src).toMatch(/export function FieldWithSibling/);
  });

  test("exports FieldWithSiblingProps interface", () => {
    expect(src).toMatch(/export interface FieldWithSiblingProps/);
  });

  test("props include label, fieldKey, siblingValue, siblingLocale, splitView, children", () => {
    expect(src).toMatch(/\blabel\b/);
    expect(src).toMatch(/\bfieldKey\b/);
    expect(src).toMatch(/\bsiblingValue\b/);
    expect(src).toMatch(/\bsiblingLocale\b/);
    expect(src).toMatch(/\bsplitView\b/);
    expect(src).toMatch(/\bchildren\b/);
  });

  test("renders single-column when splitView is false", () => {
    // Should return just children wrapped in a div when !splitView
    expect(src).toMatch(/!splitView/);
    expect(src).toMatch(/children/);
  });

  test("renders two-column grid when splitView is true", () => {
    expect(src).toMatch(/grid.*cols-2|grid-cols-2/);
  });

  test("renders sibling locale label in split view", () => {
    expect(src).toMatch(/siblingLocale/);
    expect(src).toMatch(/toUpperCase/);
  });

  test("does not include a collapsible chevron", () => {
    expect(src).not.toMatch(/ChevronDown|ChevronRight/);
    expect(src).not.toMatch(/collapsed/);
  });

  test("renders read-only sibling display (no input)", () => {
    // The sibling side should be a div, not an input/textarea
    expect(src).toMatch(/bg-muted/);
    expect(src).not.toMatch(/<input[\s\S]*siblingValue/);
  });
});
