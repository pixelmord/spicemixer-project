import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

test.describe("home", () => {
  test("EN home renders", async ({ page }) => {
    await visitWithoutErrors(page, "/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("link", { name: /mixtures/i }).first()).toBeVisible();
  });

  test("DE home renders", async ({ page }) => {
    await visitWithoutErrors(page, "/de/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("link", { name: /mischungen/i }).first()).toBeVisible();
  });
});
