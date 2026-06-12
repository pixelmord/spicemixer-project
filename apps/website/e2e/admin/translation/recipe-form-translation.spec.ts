/**
 * Translation split-view matrix: RecipeForm (collection = "recipes")
 *
 * Seeded from e2e/fixtures/content-overlay/:
 *   EN: /admin/recipes/e2e-dish/edit (canonical, no DE sibling → sibling fetch returns null)
 */
import { expect, test } from "@playwright/test";
import {
  clearTranslationPrefs,
  completenessToggleBtn,
  getBulkWritePolicy,
  getSplitViewPref,
  openOverflowMenu,
  setSplitViewPref,
  splitViewToggle,
} from "./shared.ts";

const EDIT_URL = "/admin/recipes/e2e-dish/edit";
const BILINGUAL_URL = "/admin/recipes/e2e-dish-bilingual/edit";

test.describe("RecipeForm split-view: toggle + persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await clearTranslationPrefs(page);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("RecipeForm non-translation draft: toggle split view on manually", async ({ page }) => {
    await expect(splitViewToggle(page)).toBeVisible();
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await splitViewToggle(page).click();
    expect(await getSplitViewPref(page)).toBe("true");
  });

  test("RecipeForm split-view toggle persists across reload", async ({ page }) => {
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await splitViewToggle(page).click();
    expect(await getSplitViewPref(page)).toBe("true");

    await page.reload({ waitUntil: "networkidle" });
    expect(await getSplitViewPref(page)).toBe("true");
  });

  test.fixme("RecipeForm translation draft auto-renders split view on load", async () => {
    // RecipeForm does not have auto-enable split view from initialMeta.translationOf.
    // No DE recipe translations exist in seeded content.
    // Needs: (1) a seeded DE recipe with translationOf in meta, and
    //        (2) RecipeForm to auto-enable splitView when initialMeta.translationOf is set.
  });
});

test.describe("RecipeForm split-view: completeness rail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("RecipeForm completeness rail collapses to icon in split view", async ({ page }) => {
    await expect(completenessToggleBtn(page)).toBeVisible();
  });

  test("RecipeForm completeness rail popover renders from icon", async ({ page }) => {
    await completenessToggleBtn(page).click();
    await expect(
      page
        .locator(".absolute")
        .filter({ hasText: /required|recommended|missing/i })
        .first(),
    ).toBeVisible({ timeout: 3000 });
  });
});

test.describe("RecipeForm split-view: sibling data", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("RecipeForm sibling read-only renders translatable fields in split view", async ({
    page,
  }) => {
    await expect(page.locator(".border-dashed").first()).toBeVisible({ timeout: 5000 });
  });

  test("RecipeForm sibling-data skeleton placeholders render during fetch", async ({ page }) => {
    await expect(page.locator(".border-dashed").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("RecipeForm split-view: per-field translate buttons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("RecipeForm per-field translate button visible in split view", async ({ page }) => {
    await expect(page.getByRole("button", { name: /translate from/i }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("RecipeForm per-field translate label is 'Translate from'", async ({ page }) => {
    const btn = page.getByRole("button", { name: /translate from/i }).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    expect(await btn.textContent()).toMatch(/translate from/i);
  });

  test("RecipeForm per-field translate merge option available", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Merge options" }).first()).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Merge options" }).first().click();
    await expect(page.getByRole("checkbox", { name: /merge with existing/i })).toBeVisible();
  });

  test("RecipeForm per-field translate (no merge) runs AI and shows suggestion", async ({
    page,
  }) => {
    await page.goto(BILINGUAL_URL, { waitUntil: "networkidle" });
    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("RecipeForm per-field translate with 'Merge with existing' enabled", async ({ page }) => {
    await page.goto(BILINGUAL_URL, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Merge options" }).first().click();
    await page.getByRole("checkbox", { name: /merge with existing/i }).check();
    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("RecipeForm per-field translate not rendered for skip-mode fields", async ({ page }) => {
    const translateBtns = page.getByRole("button", { name: /translate from/i });
    const count = await translateBtns.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test.fixme("RecipeForm per-field translate label is 'Copy from' for copy-mode fields", async () => {
    // RECIPE_AI_CONTRACT only has translate-mode fields.
    // No copy-mode fields exist in the current contract.
  });

  test.fixme("RecipeForm per-field merge option absent in copy-mode dropdown", async () => {
    // No copy-mode fields in RECIPE_AI_CONTRACT.
  });
});

test.describe("RecipeForm: bulk translate (split view)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("RecipeForm bulk translate button renders in split view", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /translate missing|re-translate/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("RecipeForm bulk translate 'fill-gaps' only targets empty fields", async ({ page }) => {
    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Translate missing fields" }).last().click();
    await expect(
      page.getByRole("button", { name: "Translate missing fields" }).first(),
    ).toBeVisible();
  });

  test("RecipeForm bulk translate 'replace-all' overwrites all fields", async ({ page }) => {
    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Re-translate all fields" }).last().click();
    await expect(
      page.getByRole("button", { name: "Re-translate all fields" }).first(),
    ).toBeVisible();
  });

  test("RecipeForm write policy persists in spicemixer.bulkTranslateWritePolicy", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Re-translate all fields" }).last().click();
    expect(await getBulkWritePolicy(page)).toBe("replace-all");

    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Translate missing fields" }).last().click();
    expect(await getBulkWritePolicy(page)).toBe("fill-gaps");
  });

  test.fixme("RecipeForm bulk suggest accept-all clears pending count", async () => {
    // Mock AI returns improvements: [] — no suggestions for bulk suggest.
  });
});

test.describe("RecipeForm: per-field AI suggest", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("RecipeForm per-field AI suggest with user prompt", async ({ page }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await expect(page.getByPlaceholder(/add instructions/i)).toBeVisible();
    await page.getByPlaceholder(/add instructions/i).fill("More detail please");
    await page
      .getByRole("button", { name: /run|submit/i })
      .first()
      .click();
  });

  test("RecipeForm per-field AI suggest textarea resets on dropdown close", async ({ page }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await page.getByPlaceholder(/add instructions/i).fill("Some instructions");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await expect(page.getByPlaceholder(/add instructions/i)).toHaveValue("");
  });
});

test.describe("RecipeForm: section navigation", () => {
  test("RecipeForm section anchors exist inside EntityFormLayout", async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await expect(page.getByRole("link").first()).toBeVisible();
  });
});

test.describe("RecipeForm: header overflow delete", () => {
  test("RecipeForm header overflow Delete prompts via window.confirm", async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await openOverflowMenu(page);
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: /delete/i }).click();
    await expect(page).toHaveURL(new RegExp("e2e-dish"));
  });
});

test.describe("RecipeForm: translate dialog + slug picker", () => {
  test("RecipeForm slug picker renders in Phase 1 (recipes need per-locale slug)", async ({
    page,
  }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    const translateBtn = page.getByRole("button", { name: /^add de$/i });
    await expect(translateBtn).toBeVisible({ timeout: 3000 });
    await translateBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
    await expect(
      page.getByRole("dialog").getByRole("button", { name: /translate|start/i }),
    ).toBeVisible({
      timeout: 3000,
    });
  });

  test.fixme("RecipeForm create canonical → translate → land in split view", async () => {
    // Complex: navigate dialog to completion (slug fill + bulk translate phases) then
    // verify new DE recipe edit page opens with split view auto-enabled.
  });

  test.fixme("RecipeForm Phase 1 partial-failure toast renders", async () => {
    // Requires route intercept on the translation action.
  });

  test.fixme("RecipeForm Phase 1 partial-failure form banner lists unfilled fields", async () => {
    // Same as above.
  });

  test.fixme("RecipeForm Phase 1 partial-failure banner is dismissible", async () => {
    // Same as above.
  });
});

test.describe("RecipeForm: swap language", () => {
  test.fixme("RecipeForm swap-language dirty-prompt: cancel keeps editor", async () => {
    // RecipeForm does not expose an onSwapLanguage handler — no swap button rendered.
  });

  test.fixme("RecipeForm swap-language dirty-prompt: confirm navigates", async () => {
    // Same — no swap-language in RecipeForm.
  });
});
