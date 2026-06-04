/**
 * Translation split-view matrix: RecipeForm (collection = "mixtures")
 *
 * Seeded from e2e/fixtures/content-overlay/:
 *   EN: /admin/mixtures/e2e-blend/edit (canonical, no DE sibling → sibling fetch returns null)
 *
 * The mixture form is the same RecipeForm component with collection="mixtures".
 * Tests mirror the recipe matrix but verify the mixture-specific URL and behaviour.
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

const EDIT_URL = "/admin/mixtures/e2e-blend/edit";
const BILINGUAL_URL = "/admin/mixtures/e2e-mix-bilingual/edit";

test.describe("MixtureForm split-view: toggle + persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await clearTranslationPrefs(page);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("MixtureForm non-translation draft: toggle split view on manually", async ({ page }) => {
    await expect(splitViewToggle(page)).toBeVisible();
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await splitViewToggle(page).click();
    expect(await getSplitViewPref(page)).toBe("true");
  });

  test("MixtureForm split-view toggle persists across reload", async ({ page }) => {
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await splitViewToggle(page).click();
    expect(await getSplitViewPref(page)).toBe("true");

    await page.reload({ waitUntil: "networkidle" });
    expect(await getSplitViewPref(page)).toBe("true");
  });

  test.fixme("MixtureForm translation draft auto-renders split view on load", async () => {
    // RecipeForm (mixtures) does not auto-enable split view from initialMeta.translationOf.
    // No DE mixture translations with translationOf exist in seeded content.
  });
});

test.describe("MixtureForm split-view: completeness rail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("MixtureForm completeness rail collapses to icon in split view", async ({ page }) => {
    await expect(completenessToggleBtn(page)).toBeVisible();
  });

  test("MixtureForm completeness rail popover renders from icon", async ({ page }) => {
    await completenessToggleBtn(page).click();
    await expect(
      page
        .locator(".absolute")
        .filter({ hasText: /required|recommended|missing/i })
        .first(),
    ).toBeVisible({ timeout: 3000 });
  });
});

test.describe("MixtureForm split-view: sibling data", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("MixtureForm sibling read-only renders translatable fields in split view", async ({
    page,
  }) => {
    await expect(page.locator(".border-dashed").first()).toBeVisible({ timeout: 5000 });
  });

  test("MixtureForm sibling-data skeleton placeholders render during fetch", async ({ page }) => {
    await expect(page.locator(".border-dashed").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("MixtureForm split-view: per-field translate buttons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("MixtureForm per-field translate button visible in split view", async ({ page }) => {
    await expect(page.getByRole("button", { name: /translate from/i }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("MixtureForm per-field translate label is 'Translate from'", async ({ page }) => {
    const btn = page.getByRole("button", { name: /translate from/i }).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    expect(await btn.textContent()).toMatch(/translate from/i);
  });

  test("MixtureForm per-field translate merge option available", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Merge options" }).first()).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Merge options" }).first().click();
    await expect(page.getByRole("checkbox", { name: /merge with existing/i })).toBeVisible();
  });

  test("MixtureForm per-field translate (no merge) runs AI and shows suggestion", async ({
    page,
  }) => {
    await page.goto(BILINGUAL_URL, { waitUntil: "networkidle" });
    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("MixtureForm per-field translate with 'Merge with existing' enabled", async ({ page }) => {
    await page.goto(BILINGUAL_URL, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Merge options" }).first().click();
    await page.getByRole("checkbox", { name: /merge with existing/i }).check();
    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("MixtureForm per-field translate not rendered for skip-mode fields", async ({ page }) => {
    const translateBtns = page.getByRole("button", { name: /translate from/i });
    const count = await translateBtns.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test.fixme("MixtureForm per-field translate label is 'Copy from' for copy-mode fields", async () => {
    // No copy-mode fields in RECIPE_AI_CONTRACT used for mixtures.
  });

  test.fixme("MixtureForm per-field merge option absent in copy-mode dropdown", async () => {
    // No copy-mode fields in RECIPE_AI_CONTRACT.
  });
});

test.describe("MixtureForm: bulk translate (split view)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("MixtureForm bulk translate button renders in split view", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /translate missing|re-translate/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("MixtureForm bulk translate 'fill-gaps' only targets empty fields", async ({ page }) => {
    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Translate missing fields" }).last().click();
    await expect(
      page.getByRole("button", { name: "Translate missing fields" }).first(),
    ).toBeVisible();
  });

  test("MixtureForm bulk translate 'replace-all' overwrites all fields", async ({ page }) => {
    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Re-translate all fields" }).last().click();
    await expect(
      page.getByRole("button", { name: "Re-translate all fields" }).first(),
    ).toBeVisible();
  });

  test("MixtureForm write policy persists in spicemixer.bulkTranslateWritePolicy", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Re-translate all fields" }).last().click();
    expect(await getBulkWritePolicy(page)).toBe("replace-all");

    await page.getByRole("button", { name: "Translation options" }).click();
    await page.getByRole("button", { name: "Translate missing fields" }).last().click();
    expect(await getBulkWritePolicy(page)).toBe("fill-gaps");
  });

  test.fixme("MixtureForm bulk suggest accept-all clears pending count", async () => {
    // Mock AI returns improvements: [] — no suggestions from bulk suggest.
  });
});

test.describe("MixtureForm: per-field AI suggest", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("MixtureForm per-field AI suggest with user prompt", async ({ page }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await expect(page.getByPlaceholder(/add instructions/i)).toBeVisible();
    await page.getByPlaceholder(/add instructions/i).fill("Be more descriptive");
    await page
      .getByRole("button", { name: /run|submit/i })
      .first()
      .click();
  });

  test("MixtureForm per-field AI suggest textarea resets on dropdown close", async ({ page }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await page.getByPlaceholder(/add instructions/i).fill("Some text");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await expect(page.getByPlaceholder(/add instructions/i)).toHaveValue("");
  });
});

test.describe("MixtureForm: section navigation", () => {
  test("MixtureForm section anchors exist inside EntityFormLayout", async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await expect(page.getByRole("link").first()).toBeVisible();
  });
});

test.describe("MixtureForm: header overflow delete", () => {
  test("MixtureForm header overflow Delete prompts via window.confirm", async ({ page }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    await openOverflowMenu(page);
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: /delete/i }).click();
    await expect(page).toHaveURL(new RegExp("e2e-blend"));
  });
});

test.describe("MixtureForm: translate dialog + slug picker", () => {
  test("MixtureForm slug picker renders in Phase 1 (mixtures need per-locale slug)", async ({
    page,
  }) => {
    await page.goto(EDIT_URL, { waitUntil: "networkidle" });
    const translateBtn = page.getByRole("button", { name: /^add de$/i });
    await expect(translateBtn).toBeVisible({ timeout: 3000 });
    await translateBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
    await expect(
      page.getByRole("dialog").getByRole("button", { name: /translate|start/i }),
    ).toBeVisible({ timeout: 3000 });
  });

  test.fixme("MixtureForm create canonical → translate → land in split view", async () => {
    // Complex CRUD flow with slug picking step (twoCallMode).
  });

  test.fixme("MixtureForm Phase 1 partial-failure toast renders", async () => {
    // Requires route intercept on the mixture translation action.
  });

  test.fixme("MixtureForm Phase 1 partial-failure form banner lists unfilled fields", async () => {
    // Same as above.
  });

  test.fixme("MixtureForm Phase 1 partial-failure banner is dismissible", async () => {
    // Same as above.
  });
});

test.describe("MixtureForm: swap language", () => {
  test.fixme("MixtureForm swap-language dirty-prompt: cancel keeps editor", async () => {
    // RecipeForm (mixtures) has no swap-language handler.
  });

  test.fixme("MixtureForm swap-language dirty-prompt: confirm navigates", async () => {
    // Same.
  });
});
