import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

/**
 * Loads edit pages for representative seeded entities. The tmp content root is
 * populated from `src/content/` in global setup, so each slug resolves through
 * `LocalFsStore` to real data. Catches contract drift on the edit side the
 * same way `details.spec.ts` catches it on the public side.
 */
test.describe("admin edit pages load seeded entities", () => {
  const targets = [
    "/admin/recipes/miso-butter-ramen/edit",
    "/admin/mixtures/berbere/edit",
    "/admin/ingredients/caraway/edit",
  ];

  for (const url of targets) {
    test(url, async ({ page }) => {
      await visitWithoutErrors(page, url);
      await expect(page.locator("form").first()).toBeVisible();
    });
  }
});
