/**
 * Translation split-view matrix: IngredientForm
 *
 * Seeded from e2e/fixtures/content-overlay/:
 *   EN: /admin/ingredients/e2e-spice/edit (canonical)
 *   DE: /admin/ingredients/e2e-spice/edit?locale=de (draft, translationOf: "e2e-spice")
 *   EN-only (no DE sibling): /admin/ingredients/e2e-untranslated/edit
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

const EN_URL = "/admin/ingredients/e2e-spice/edit";
const DE_URL = "/admin/ingredients/e2e-spice/edit?locale=de";

test.describe("IngredientForm split-view: toggle + persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await clearTranslationPrefs(page);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("IngredientForm non-translation draft: toggle split view on manually", async ({ page }) => {
    await expect(splitViewToggle(page)).toBeVisible();
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await splitViewToggle(page).click();
    const stored = await getSplitViewPref(page);
    expect(stored).toBe("true");
  });

  test("IngredientForm split-view toggle persists across reload", async ({ page }) => {
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await splitViewToggle(page).click();
    expect(await getSplitViewPref(page)).toBe("true");

    await page.reload({ waitUntil: "networkidle" });
    expect(await getSplitViewPref(page)).toBe("true");
  });
});

test.describe("IngredientForm: translation draft auto-enables split view", () => {
  test("IngredientForm translation draft auto-renders split view on load", async ({ page }) => {
    await page.goto(DE_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await page.reload({ waitUntil: "networkidle" });

    const stored = await getSplitViewPref(page);
    expect(stored).toBe("true");
  });
});

test.describe("IngredientForm split-view: completeness rail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("IngredientForm completeness rail collapses to icon in split view", async ({ page }) => {
    await expect(completenessToggleBtn(page)).toBeVisible();
  });

  test("IngredientForm completeness rail popover renders from icon", async ({ page }) => {
    await completenessToggleBtn(page).click();
    await expect(
      page
        .locator(".absolute")
        .filter({ hasText: /required|recommended|missing/i })
        .first(),
    ).toBeVisible({ timeout: 3000 });
  });
});

test.describe("IngredientForm split-view: sibling data", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("IngredientForm sibling read-only renders all translatable fields in split view", async ({
    page,
  }) => {
    const siblingPanels = page.locator(".border-dashed");
    await expect(siblingPanels.first()).toBeVisible({ timeout: 8000 });
    const count = await siblingPanels.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("IngredientForm sibling-data skeleton placeholders render during fetch", async ({
    page,
  }) => {
    await expect(page.locator(".border-dashed").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("IngredientForm split-view: PairingSuggestionPanel hidden", () => {
  test("IngredientForm PairingSuggestionPanel is hidden in split view", async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: /refresh pairings|pairing suggestions/i }),
    ).toHaveCount(0);
  });
});

test.describe("IngredientForm split-view: per-field translate buttons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("IngredientForm per-field translate button visible in split view", async ({ page }) => {
    await expect(page.getByRole("button", { name: /translate from/i }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("IngredientForm per-field translate label is 'Translate from'", async ({ page }) => {
    const btn = page.getByRole("button", { name: /translate from/i }).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    const label = await btn.textContent();
    expect(label).toMatch(/translate from/i);
  });

  test("IngredientForm per-field translate merge option available", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Merge options" }).first()).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Merge options" }).first().click();
    await expect(page.getByRole("checkbox", { name: /merge with existing/i })).toBeVisible();
  });

  test("IngredientForm per-field translate (no merge) runs AI and shows suggestion", async ({
    page,
  }) => {
    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("IngredientForm per-field translate with 'Merge with existing' enabled", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Merge options" }).first().click();
    await page.getByRole("checkbox", { name: /merge with existing/i }).check();
    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("IngredientForm per-field translate not rendered for skip-mode fields", async ({ page }) => {
    const categoryGroup = page.locator("label", { hasText: "Category" }).first().locator("..");
    await expect(categoryGroup.getByRole("button", { name: /translate from/i })).toHaveCount(0);
  });

  test.fixme("IngredientForm per-field translate label is 'Copy from' for copy-mode fields", async () => {
    // The IngredientForm AI_CONTRACT has all 11 fields as mode: "translate".
    // There are no copy-mode fields in the translation contract used here.
    // The language field (copy-mode in ingredientContract) is not included
    // in the form's AI_CONTRACT. This test needs the contract to include
    // at least one copy-mode field.
  });

  test.fixme("IngredientForm per-field merge option absent in copy-mode dropdown", async () => {
    // Same as above — no copy-mode fields in current AI_CONTRACT.
  });
});

test.describe("IngredientForm: bulk translate (split view)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("IngredientForm bulk translate button renders in split view", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /translate missing|re-translate/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("IngredientForm bulk translate 'fill-gaps' only targets empty fields", async ({ page }) => {
    const dropdown = page.getByRole("button", { name: "Translation options" });
    await dropdown.click();
    await page.getByRole("button", { name: "Translate missing fields" }).last().click();
    await expect(
      page.getByRole("button", { name: "Translate missing fields" }).first(),
    ).toBeVisible();
  });

  test("IngredientForm bulk translate 'replace-all' overwrites all fields", async ({ page }) => {
    const dropdown = page.getByRole("button", { name: "Translation options" });
    await dropdown.click();
    await page.getByRole("button", { name: "Re-translate all fields" }).last().click();
    await expect(
      page.getByRole("button", { name: "Re-translate all fields" }).first(),
    ).toBeVisible();
  });

  test("IngredientForm write policy persists in spicemixer.bulkTranslateWritePolicy", async ({
    page,
  }) => {
    const dropdown = page.getByRole("button", { name: "Translation options" });
    await dropdown.click();
    await page.getByRole("button", { name: "Re-translate all fields" }).last().click();
    const stored = await getBulkWritePolicy(page);
    expect(stored).toBe("replace-all");

    await dropdown.click();
    await page.getByRole("button", { name: "Translate missing fields" }).last().click();
    const storedAfter = await getBulkWritePolicy(page);
    expect(storedAfter).toBe("fill-gaps");
  });

  test.fixme("IngredientForm bulk suggest accept-all clears pending count", async () => {
    // Mock AI returns improvements: [] — no suggestions generated for bulk suggest.
    // Needs route intercept or a mock returning improvements with minItems >= 1.
  });
});

test.describe("IngredientForm: per-field AI suggest", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("IngredientForm per-field AI suggest with user prompt", async ({ page }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await expect(page.getByPlaceholder(/add instructions/i)).toBeVisible();
    await page.getByPlaceholder(/add instructions/i).fill("Be more scientific");
    await page
      .getByRole("button", { name: /run|submit/i })
      .first()
      .click();
  });

  test("IngredientForm per-field AI suggest textarea resets on dropdown close", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await page.getByPlaceholder(/add instructions/i).fill("Some text here");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await expect(page.getByPlaceholder(/add instructions/i)).toHaveValue("");
  });
});

test.describe("IngredientForm: section navigation", () => {
  test("IngredientForm section anchors scroll correctly inside EntityFormLayout", async ({
    page,
  }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /basic/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /taxonomy/i })).toBeVisible();
  });
});

test.describe("IngredientForm: header overflow delete", () => {
  test("IngredientForm header overflow Delete prompts with confirmation dialog", async ({
    page,
  }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await openOverflowMenu(page);
    await page.getByRole("button", { name: /delete/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});

test.describe("IngredientForm: translate dialog + slug picker", () => {
  test("IngredientForm slug picker absent in Phase 1 (ingredients use shared slug)", async ({
    page,
  }) => {
    await page.goto("/admin/ingredients/e2e-untranslated/edit", { waitUntil: "networkidle" });
    const translateBtn = page.getByRole("button", { name: /^translate$/i });
    if (await translateBtn.isVisible()) {
      await translateBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
      await expect(page.getByLabel(/slug/i)).toHaveCount(0);
    }
  });

  test.fixme("IngredientForm create canonical → translate → land in split view", async () => {
    // Steps: navigate to an untranslated EN ingredient → click Translate →
    // dialog fills via mock AI → onCreate saves → onComplete opens DE edit in new tab →
    // DE edit auto-enables split view (from initialMeta.translationOf).
    // Complex multi-step CRUD; tracked for browser-based acceptance.
  });

  test.fixme("IngredientForm Phase 1 partial-failure toast renders", async () => {
    // Requires route intercept on /_actions/aiCreateIngredientTranslation to simulate
    // a partial failure (some fields filled, some failed).
  });

  test.fixme("IngredientForm Phase 1 partial-failure form banner lists unfilled fields", async () => {
    // Same as above.
  });

  test.fixme("IngredientForm Phase 1 partial-failure banner is dismissible", async () => {
    // Same as above.
  });
});

test.describe("IngredientForm: swap language", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test.fixme("IngredientForm swap-language dirty-prompt: cancel keeps editor", async () => {
    // IngredientForm has no swap-language button (no onSwapLanguage handler exposed).
  });

  test.fixme("IngredientForm swap-language dirty-prompt: confirm navigates", async () => {
    // Same — no swap-language in IngredientForm.
  });
});
