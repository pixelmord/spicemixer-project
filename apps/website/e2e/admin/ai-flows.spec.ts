import { expect, test } from "@playwright/test";
import { visitWithoutErrors } from "../fixtures/page-helpers.ts";

/**
 * AI-flow CRUD coverage is deferred for recipe/translation flows. The mock
 * provider (`AI_PROVIDER=mock`) synthesizes minimum-valid JSON from each
 * call's response schema, which is enough to keep AI actions from crashing —
 * but actually asserting suggestion UI shows/accepts/persists the mock payload
 * requires per-contract fixtures that don't exist yet. Tracking issue: add
 * when we wire pair-of-contracts snapshot fixtures.
 */
test.fixme("aiProposeTags renders mock suggestion in AiAssistPanel", async () => {});
test.fixme("aiMergeRecipe shows diff with mock payload", async () => {});
test.fixme("aiCreateTranslation persists a translated meta sidecar", async () => {});

test.describe("IngredientForm enhance flow (IngestDialog)", () => {
  test("Enhance button opens IngestDialog", async ({ page }) => {
    await visitWithoutErrors(page, "/admin/ingredients/caraway/edit");
    await page.getByRole("button", { name: /enhance/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Enhance ingredient")).toBeVisible();
  });

  test("text source: generate then apply patches form state", async ({ page }) => {
    await visitWithoutErrors(page, "/admin/ingredients/caraway/edit");
    await page.getByRole("button", { name: /enhance/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Switch to text tab and enter content
    await page.getByRole("tab", { name: /text/i }).click();
    await page.getByPlaceholder(/paste.*text/i).fill("Caraway is a biennial plant.");

    await page.getByRole("button", { name: /generate enhanced version/i }).click();

    // Review phase should appear
    await expect(page.getByRole("button", { name: /apply changes/i })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: /apply changes/i }).click();

    // Dialog should close after apply
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("prompt source: generate then apply patches form state", async ({ page }) => {
    await visitWithoutErrors(page, "/admin/ingredients/caraway/edit");
    await page.getByRole("button", { name: /enhance/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Switch to prompt tab
    await page.getByRole("tab", { name: /prompt/i }).click();
    await page.getByPlaceholder(/describe/i).fill("Enhance caraway description");

    await page.getByRole("button", { name: /generate enhanced version/i }).click();

    await expect(page.getByRole("button", { name: /apply changes/i })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: /apply changes/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("Try different source resets to source phase", async ({ page }) => {
    await visitWithoutErrors(page, "/admin/ingredients/caraway/edit");
    await page.getByRole("button", { name: /enhance/i }).click();

    await page.getByRole("tab", { name: /text/i }).click();
    await page.getByPlaceholder(/paste.*text/i).fill("Some caraway facts.");
    await page.getByRole("button", { name: /generate enhanced version/i }).click();

    await expect(page.getByRole("button", { name: /apply changes/i })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: /try different source/i }).click();
    // Should return to source phase
    await expect(page.getByRole("button", { name: /generate enhanced version/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /apply changes/i })).not.toBeVisible();
  });
});

test.fixme("PairingForm enhance — file source: opens IngestDialog, shows PairingDiff, applies description", async () => {});
test.fixme("PairingForm enhance — text source: opens IngestDialog, shows PairingDiff, applies description", async () => {});
test.fixme("PairingForm enhance — prompt source: opens IngestDialog, shows PairingDiff, applies description", async () => {});
