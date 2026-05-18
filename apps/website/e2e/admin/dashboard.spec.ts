import { test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

const ADMIN_ROUTES = [
  "/admin",
  "/admin/content",
  "/admin/readiness",
  "/admin/needs-review",
  "/admin/recipes",
  "/admin/mixtures",
  "/admin/ingredients",
  "/admin/pairings",
] as const;

test.describe("admin dashboard smoke", () => {
  for (const route of ADMIN_ROUTES) {
    test(`${route} renders without errors`, async ({ page }) => {
      await visitWithoutErrors(page, route);
    });
  }
});
