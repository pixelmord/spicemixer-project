import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

test.describe("locale switcher", () => {
  test("EN → DE preserves the current section", async ({ page }) => {
    await visitWithoutErrors(page, "/mixtures/");
    const deLink = page.getByRole("link", { name: /deutsch|de/i }).first();
    await expect(deLink).toBeVisible();
    await deLink.click();
    await expect(page).toHaveURL(/\/de\/mixtures\/?/);
  });

  test("DE → EN preserves the current section", async ({ page }) => {
    await visitWithoutErrors(page, "/de/mixtures/");
    const enLink = page.getByRole("link", { name: /english|en/i }).first();
    await expect(enLink).toBeVisible();
    await enLink.click();
    await expect(page).toHaveURL(/\/mixtures\/?$/);
  });
});
