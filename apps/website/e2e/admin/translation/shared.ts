import type { Page } from "@playwright/test";

export const LS_SPLIT_VIEW = "spicemixer.splitViewEnabled";
export const LS_BULK_WRITE_POLICY = "spicemixer.bulkTranslateWritePolicy";

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

export function splitViewToggle(page: Page) {
  return page.getByRole("button", { name: "Toggle split view" });
}

export function completenessToggleBtn(page: Page) {
  return page.getByRole("button", { name: /^completeness:/i });
}

export async function openOverflowMenu(page: Page) {
  await page.getByRole("button", { name: "More options" }).click();
}
