import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const LS_SPLIT_VIEW = "spicemixer.splitViewEnabled";
export const LS_BULK_WRITE_POLICY = "spicemixer.bulkTranslateWritePolicy";

// ── localStorage helpers ────────────────────────────────────────────────────

export async function setSplitViewPref(page: Page, value: boolean) {
  await page.evaluate(
    ([key, val]) => localStorage.setItem(key, val),
    [LS_SPLIT_VIEW, String(value)],
  );
}

export async function getSplitViewPref(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), LS_SPLIT_VIEW);
}

export async function getBulkWritePolicy(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), LS_BULK_WRITE_POLICY);
}

export async function clearTranslationPrefs(page: Page) {
  await page.evaluate(
    ([k1, k2]) => {
      localStorage.removeItem(k1);
      localStorage.removeItem(k2);
    },
    [LS_SPLIT_VIEW, LS_BULK_WRITE_POLICY],
  );
}

// ── Navigation helper with pre-cleared prefs ─────────────────────────────────

export async function gotoForm(page: Page, url: string, clearPrefs = true) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (clearPrefs) await clearTranslationPrefs(page);
  await page.reload({ waitUntil: "networkidle" });
}

// ── Split-view UI helpers ─────────────────────────────────────────────────────

export function splitViewToggle(page: Page) {
  return page.getByRole("button", { name: "Toggle split view" });
}

export async function enableSplitView(page: Page) {
  const btn = splitViewToggle(page);
  // Only click if not already in split-view mode
  const current = await getSplitViewPref(page);
  if (current !== "true") {
    await btn.click();
    await expect(splitViewToggle(page)).toHaveClass(/bg-primary/);
  }
}

// ── Completeness rail helpers ─────────────────────────────────────────────────

export function completenessToggleBtn(page: Page) {
  return page.getByRole("button", { name: "Toggle completeness panel" });
}

// ── Overflow menu helpers ─────────────────────────────────────────────────────

export async function openOverflowMenu(page: Page) {
  await page.getByRole("button", { name: "More options" }).click();
}

// ── Translate button helpers ──────────────────────────────────────────────────

export function fieldTranslateBtn(page: Page, fieldPath: string) {
  return page
    .locator(`[data-field-path="${fieldPath}"]`)
    .locator("button", { hasText: /translate from|copy from/i })
    .first();
}

// Generic per-field translate by label pattern
export function translateBtnByLabel(page: Page, labelPattern: RegExp) {
  return page.getByRole("button", { name: labelPattern }).first();
}

// ── Assertions ────────────────────────────────────────────────────────────────

export async function assertSplitViewActive(page: Page) {
  await expect(splitViewToggle(page)).toHaveClass(/bg-primary/);
  const stored = await getSplitViewPref(page);
  expect(stored).toBe("true");
}

export async function assertSplitViewInactive(page: Page) {
  const btn = splitViewToggle(page);
  await expect(btn).not.toHaveClass(/bg-primary\/10/);
  const stored = await getSplitViewPref(page);
  expect(stored).toBe("false");
}
