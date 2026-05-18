import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

const ROUTES = [
  { path: "/mixtures/", linkPattern: /mixtures\/[^/]+\/$/ },
  { path: "/ingredients/", linkPattern: /ingredients\/[^/]+\/$/ },
  { path: "/recipes/", linkPattern: /recipes\/[^/]+\/$/ },
  { path: "/pairings/", linkPattern: /pairings\/[^/]+\/$/ },
] as const;

test.describe("public index pages", () => {
  for (const { path, linkPattern } of ROUTES) {
    test(`${path} renders and links to detail pages`, async ({ page }) => {
      await visitWithoutErrors(page, path);
      // At least one link to a detail page slug should appear.
      const detailLink = page.locator(`a[href]`).filter({ hasText: /\S/ });
      const href = await detailLink.evaluateAll(
        (els, pattern) =>
          els.map((e) => e.getAttribute("href") ?? "").find((h) => new RegExp(pattern).test(h)) ??
          null,
        linkPattern.source,
      );
      expect(href, `expected an entity link matching ${linkPattern} on ${path}`).toBeTruthy();
    });
  }
});
