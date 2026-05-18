import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

test.describe("search", () => {
  test("EN search renders and finds 'cumin'", async ({ page }) => {
    // Pagefind injects its own scripts which can log info-level diagnostics
    // depending on the bundled assets — only fail on real errors.
    await visitWithoutErrors(page, "/search/", { ignore: ["pagefind"] });
    const input = page.locator("input[type='text'], input[type='search']").first();
    await expect(input).toBeVisible();
    await input.fill("cumin");
    await expect(page.getByText(/cumin/i).first()).toBeVisible({ timeout: 7000 });
  });
});
