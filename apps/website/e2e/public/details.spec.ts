import { test } from "@playwright/test";
import { REPRESENTATIVE_SLUGS } from "../fixtures/slugs.ts";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

/**
 * Regression-catching matrix: every representative slug in every collection,
 * per locale. This is the test that would have caught the
 * `meta.goesWellWith` undefined crash on /mixtures/berbere/.
 *
 * Failures here mean either (a) the schema no longer matches what the page
 * template reads, (b) a helper threw on missing optional data, or
 * (c) a recently-added page is silently breaking on a known slug.
 */
test.describe("detail pages render without runtime errors", () => {
  for (const [collection, locales] of Object.entries(REPRESENTATIVE_SLUGS)) {
    for (const [locale, slugs] of Object.entries(locales)) {
      for (const slug of slugs as readonly string[]) {
        const prefix = locale === "en" ? "" : `/${locale}`;
        const url = `${prefix}/${collection}/${slug}/`;
        test(`${url}`, async ({ page }) => {
          await visitWithoutErrors(page, url);
        });
      }
    }
  }
});
