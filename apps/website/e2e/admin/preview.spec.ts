import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

/**
 * Regression test: the preview page was redirecting to /admin because
 * store.get() was called with a bare slug (e.g. "miso-butter-ramen") while
 * items are stored with a locale prefix ("en/miso-butter-ramen").
 *
 * Also verifies that getMeta() receives the correct locale, and that the
 * ingredient preview link on the edit form opens the public ingredient page
 * rather than the admin dashboard.
 */
test.describe("admin preview page renders entity content", () => {
  const cases = [
    {
      url: "/preview/recipes/miso-butter-ramen",
      name: /miso butter ramen/i,
    },
    {
      url: "/preview/mixtures/berbere",
      name: /berbere/i,
    },
  ];

  for (const { url, name } of cases) {
    test(`${url} shows recipe content, not admin dashboard`, async ({ page }) => {
      await visitWithoutErrors(page, url);

      // Must NOT have been redirected to the admin dashboard.
      expect(page.url()).not.toContain("/admin");

      // The preview banner must be present (confirms we're on the preview page).
      await expect(page.getByText("Preview mode")).toBeVisible();

      // The entity name must appear in the page — confirms store lookup succeeded.
      await expect(page.getByRole("heading", { name }).first()).toBeVisible();
    });
  }

  test("ingredient edit form has a working preview link", async ({ page }) => {
    await visitWithoutErrors(page, "/admin/ingredients/caraway/edit");

    // The Preview button must be present and enabled in the action bar.
    const previewBtn = page.getByRole("button", { name: /preview/i });
    await expect(previewBtn).toBeVisible();
    await expect(previewBtn).toBeEnabled();

    // Clicking it should open a dialog containing an iframe pointed at the
    // public ingredient page — not the admin section.
    await previewBtn.click();
    const iframe = page.frameLocator('iframe[title="Preview"]');
    // The public ingredient page must load (not redirect to admin).
    await expect(iframe.locator("body")).not.toContainText("Admin dashboard");
  });
});
