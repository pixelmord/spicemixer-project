import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, beforeAll } from "vite-plus/test";

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENTS = join(WEBSITE_ROOT, "src", "components", "admin");

describe("EntityFormLayout — module structure", () => {
  let src: string;

  beforeAll(async () => {
    src = await readFile(join(COMPONENTS, "EntityFormLayout.tsx"), "utf-8");
  });

  test("exports EntityFormLayout component", () => {
    expect(src).toMatch(/export function EntityFormLayout/);
  });

  test("exports EntityFormLayoutProps interface", () => {
    expect(src).toMatch(/export interface EntityFormLayoutProps/);
  });

  test("exports OverflowMenuItem interface", () => {
    expect(src).toMatch(/export interface OverflowMenuItem/);
  });

  test("props include all required slots", () => {
    const requiredProps = [
      "title",
      "localeChip",
      "sections",
      "completenessPanel",
      "footer",
      "splitView",
      "onToggleSplitView",
      "children",
    ];
    for (const prop of requiredProps) {
      expect(src, `missing prop: ${prop}`).toMatch(new RegExp(`\\b${prop}\\b`));
    }
  });

  test("props include optional slots", () => {
    const optionalProps = [
      "headerAuxiliary",
      "overflowMenuItems",
      "extraSidebarBlocks",
      "subHeaderStrip",
      "siblingLocale",
      "onSwapLanguage",
    ];
    for (const prop of optionalProps) {
      expect(src, `missing optional prop: ${prop}`).toMatch(new RegExp(`\\b${prop}\\b`));
    }
  });

  test("renders SectionNav with sections prop", () => {
    expect(src).toMatch(/SectionNav/);
    expect(src).toMatch(/sections/);
  });

  test("renders completeness panel", () => {
    expect(src).toMatch(/completenessPanel/);
  });

  test("renders completeness as icon+popover in split view (collapsed rail)", () => {
    // In split view, completeness should be inside a toggled popover, not always visible
    expect(src).toMatch(/splitView/);
    expect(src).toMatch(/completenessOpen|Toggle completeness/i);
  });

  test("renders overflow menu with handlers", () => {
    expect(src).toMatch(/overflowMenuItems/);
    expect(src).toMatch(/item\.onClick/);
  });

  test("renders split-view toggle button", () => {
    expect(src).toMatch(/onToggleSplitView/);
    expect(src).toMatch(/Toggle split view/i);
  });

  test("renders swap language button when onSwapLanguage is provided", () => {
    expect(src).toMatch(/onSwapLanguage/);
  });

  test("renders sibling locale chip in split view", () => {
    expect(src).toMatch(/siblingLocale/);
  });

  test("renders subHeaderStrip when provided", () => {
    expect(src).toMatch(/subHeaderStrip/);
  });

  test("renders extraSidebarBlocks in sidebar", () => {
    expect(src).toMatch(/extraSidebarBlocks/);
  });

  test("renders footer slot", () => {
    expect(src).toMatch(/\{footer\}/);
  });
});
