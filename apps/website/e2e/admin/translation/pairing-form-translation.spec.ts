/**
 * Translation split-view matrix: PairingForm
 *
 * Seeded from e2e/fixtures/content-overlay/:
 *   EN: /admin/pairings/e2e-pair-a--e2e-pair-b/edit?locale=en (canonical)
 *   DE: /admin/pairings/e2e-pair-a--e2e-pair-b/edit?locale=de (draft, translationOf)
 */
import { expect, test } from "@playwright/test";
import {
  clearTranslationPrefs,
  completenessToggleBtn,
  getSplitViewPref,
  openOverflowMenu,
  setSplitViewPref,
  splitViewToggle,
} from "./shared.ts";

const EN_URL = "/admin/pairings/e2e-pair-a--e2e-pair-b/edit?locale=en";
const DE_URL = "/admin/pairings/e2e-pair-a--e2e-pair-b/edit?locale=de";

test.describe("PairingForm split-view: split-view toggle + persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await clearTranslationPrefs(page);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("PairingForm non-translation draft: toggle split view on manually", async ({ page }) => {
    await expect(splitViewToggle(page)).toBeVisible();
    const stored = await getSplitViewPref(page);
    const wasActive = stored === "true";
    await splitViewToggle(page).click();
    const nowStored = await getSplitViewPref(page);
    expect(nowStored).toBe(wasActive ? "false" : "true");
  });

  test("PairingForm split-view toggle persists across reload", async ({ page }) => {
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await expect(splitViewToggle(page)).toBeVisible();

    await splitViewToggle(page).click();
    const stored = await getSplitViewPref(page);
    expect(stored).toBe("true");

    await page.reload({ waitUntil: "networkidle" });
    const afterReload = await getSplitViewPref(page);
    expect(afterReload).toBe("true");
  });
});

test.describe("PairingForm split-view: translation draft auto-enables split view", () => {
  test("PairingForm translation draft auto-renders split view on load", async ({ page }) => {
    await page.goto(DE_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await page.reload({ waitUntil: "networkidle" });

    const stored = await getSplitViewPref(page);
    expect(stored).toBe("true");
  });
});

test.describe("PairingForm split-view: completeness rail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("PairingForm completeness rail collapses to icon in split view", async ({ page }) => {
    await expect(completenessToggleBtn(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle completeness panel" })).toBeVisible();
  });

  test("PairingForm completeness rail popover renders from icon", async ({ page }) => {
    await completenessToggleBtn(page).click();
    await expect(
      page
        .locator(".absolute")
        .filter({ hasText: /required|recommended|completeness/i })
        .first(),
    ).toBeVisible({ timeout: 3000 });
  });
});

test.describe("PairingForm split-view: sibling data", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("PairingForm sibling read-only renders description in split view", async ({ page }) => {
    await expect(page.locator(".border-dashed").first()).toBeVisible({ timeout: 5000 });
  });

  test("PairingForm sibling-data skeleton placeholders render during fetch", async ({ page }) => {
    await expect(page.locator(".border-dashed").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("PairingForm split-view: per-field translate buttons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("PairingForm per-field translate button visible in split view", async ({ page }) => {
    await expect(page.getByRole("button", { name: /translate from/i }).first()).toBeVisible();
  });

  test("PairingForm per-field translate label is 'Translate from'", async ({ page }) => {
    const btn = page.getByRole("button", { name: /translate from/i }).first();
    await expect(btn).toBeVisible();
    const label = await btn.textContent();
    expect(label).toMatch(/translate from/i);
  });

  test("PairingForm per-field translate merge option available", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Merge options" })).toBeVisible();
    await page.getByRole("button", { name: "Merge options" }).click();
    await expect(page.getByRole("checkbox", { name: /merge with existing/i })).toBeVisible();
  });

  test("PairingForm per-field translate (no merge) runs AI and shows suggestion", async ({
    page,
  }) => {
    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("PairingForm per-field translate with 'Merge with existing' enabled", async ({ page }) => {
    await page.getByRole("button", { name: "Merge options" }).click();
    await page.getByRole("checkbox", { name: /merge with existing/i }).check();
    await expect(page.getByRole("checkbox", { name: /merge with existing/i })).toBeChecked();

    const translateBtn = page.getByRole("button", { name: /translate from/i }).first();
    await translateBtn.click();
    await expect(page.getByRole("button", { name: /apply|accept/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("PairingForm split view: no translate button in non-split view", async ({ page }) => {
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /ai suggest/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /translate from/i })).toHaveCount(0);
  });
});

test.describe("PairingForm: per-field AI suggest", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, false);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("PairingForm per-field AI suggest with user prompt", async ({ page }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await expect(page.getByPlaceholder(/add instructions/i)).toBeVisible();
    await page.getByPlaceholder(/add instructions/i).fill("Make it more poetic");
    await page
      .getByRole("button", { name: /run|submit/i })
      .first()
      .click();
  });

  test("PairingForm per-field AI suggest textarea resets on dropdown close", async ({ page }) => {
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    await page.getByPlaceholder(/add instructions/i).fill("Some prompt text");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Custom prompt options" }).first().click();
    const textarea = page.getByPlaceholder(/add instructions/i);
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("");
  });

  test.fixme("PairingForm bulk suggest accept-all clears pending count", async () => {
    // Mock AI returns improvements: [] so no suggestions are generated.
    // Needs a real AI response or a route intercept returning at least one improvement.
  });
});

test.describe("PairingForm: section navigation", () => {
  test("PairingForm section anchors exist inside EntityFormLayout", async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: /endpoints/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /description/i })).toBeVisible();
  });
});

test.describe("PairingForm: swap language", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "domcontentloaded" });
    await clearTranslationPrefs(page);
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
  });

  test("PairingForm swap language button navigates to sibling locale", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Swap language" })).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Swap language" }).click();
    await page.waitForURL(/locale=de/, { timeout: 5000 });
    expect(page.url()).toContain("locale=de");
  });

  test.fixme("PairingForm swap-language dirty-prompt: cancel keeps editor", async () => {
    // Feature not implemented: PairingForm.handleSwapLanguage navigates directly
    // without checking for unsaved changes. Needs a dirty-state guard.
  });

  test.fixme("PairingForm swap-language dirty-prompt: confirm navigates", async () => {
    // Feature not implemented: same as above.
  });
});

test.describe("PairingForm: header overflow delete", () => {
  test("PairingForm header overflow Delete prompts confirmation via window.confirm", async ({
    page,
  }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await openOverflowMenu(page);
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: /delete/i }).click();
    await expect(page).toHaveURL(new RegExp("e2e-pair-a--e2e-pair-b"));
  });
});

test.describe("PairingForm: translate dialog + slug picker", () => {
  test("PairingForm slug picker absent in Phase 1 (pairings use shared slug)", async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await openOverflowMenu(page);
    const translateBtn = page.getByRole("button", { name: /translate/i });
    await translateBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel(/slug/i)).toHaveCount(0);
  });

  test.fixme("PairingForm create canonical → translate → land in split view", async () => {
    // Complex CRUD flow: needs a new pairing without an existing translation.
    // Tracked separately in the full create-translate flow.
  });

  test.fixme("PairingForm Phase 1 partial-failure toast renders", async () => {
    // Requires a Playwright route intercept on /_actions/aiTranslatePairing
    // to return a partial failure response before this can be tested.
  });

  test.fixme("PairingForm Phase 1 partial-failure form banner lists unfilled fields", async () => {
    // Same as above.
  });

  test.fixme("PairingForm Phase 1 partial-failure banner is dismissible", async () => {
    // Same as above.
  });
});

test.describe("PairingForm: bulk AI (no subHeaderStrip, subHeaderStrip=null)", () => {
  test("PairingForm has no bulk translate strip (single translatable field)", async ({ page }) => {
    await page.goto(EN_URL, { waitUntil: "networkidle" });
    await setSplitViewPref(page, true);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /translate missing|re-translate/i })).toHaveCount(
      0,
    );
  });
});
