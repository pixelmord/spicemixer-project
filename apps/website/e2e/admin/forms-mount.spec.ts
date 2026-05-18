import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

/**
 * Smoke-test that the admin "new entity" pages return 200 and the React form
 * hydrates. Asserts on the heading rendered by the React component, not the
 * shell, so a failed mount is observable.
 */
const cases = [
  { url: "/admin/recipes/new", heading: /new recipe/i },
  { url: "/admin/mixtures/new", heading: /new mixture/i },
  { url: "/admin/ingredients/new", heading: /new ingredient/i },
  { url: "/admin/pairings/new", heading: /new pairing/i },
];

test.describe("admin new-entity forms mount", () => {
  for (const { url, heading } of cases) {
    test(url, async ({ page }) => {
      await visitWithoutErrors(page, url);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    });
  }
});
