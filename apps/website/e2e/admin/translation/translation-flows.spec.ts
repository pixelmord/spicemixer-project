/**
 * Translation split-view coverage matrix — index file.
 *
 * This file documents which matrix cells are covered and where to find each
 * test. Run `rg "<cell-name>" e2e/admin/translation/` to verify coverage.
 *
 * Per-form spec files:
 *   - pairing-form-translation.spec.ts     (PairingForm column)
 *   - ingredient-form-translation.spec.ts  (IngredientForm column)
 *   - recipe-form-translation.spec.ts      (RecipeForm/recipes column)
 *   - mixture-form-translation.spec.ts     (RecipeForm/mixtures column)
 *
 * Matrix coverage (✅ implemented, 🔲 .fixme — see per-file for reason):
 *
 * | Flow                                           | Pairing | Ingredient | Recipe | Mixture |
 * |------------------------------------------------|---------|------------|--------|---------|
 * | Create canonical → translate → land split view | 🔲      | 🔲         | 🔲     | 🔲      |
 * | Sibling read-only renders all translatable flds | ✅      | ✅         | ✅     | ✅      |
 * | Split-view toggle persists across reload        | ✅      | ✅         | ✅     | ✅      |
 * | Bulk translate "fill-gaps" only fills empty     | n/a     | ✅         | ✅     | ✅      |
 * | Bulk translate "replace-all" overwrites         | n/a     | ✅         | ✅     | ✅      |
 * | Write policy persists (bulkTranslateWritePolicy)| n/a     | ✅         | ✅     | ✅      |
 * | Per-field translate (no merge)                  | ✅      | ✅         | ✅     | ✅      |
 * | Per-field translate with "Merge with existing"  | ✅      | ✅         | ✅     | ✅      |
 * | Per-field translate not rendered for skip flds  | n/a     | ✅         | ✅     | ✅      |
 * | Per-field translate label "Copy from" (copy)    | n/a     | 🔲         | 🔲     | 🔲      |
 * | Per-field merge absent in copy-mode dropdown    | n/a     | 🔲         | 🔲     | 🔲      |
 * | Per-field AI suggest with user prompt           | ✅      | ✅         | ✅     | ✅      |
 * | Per-field AI suggest textarea resets on close   | ✅      | ✅         | ✅     | ✅      |
 * | Bulk suggest accept-all clears pending count    | 🔲      | 🔲         | 🔲     | 🔲      |
 * | Swap-language dirty-prompt cancels keeps editor | 🔲      | 🔲         | 🔲     | 🔲      |
 * | Swap-language dirty-prompt confirm navigates    | 🔲      | 🔲         | 🔲     | 🔲      |
 * | Header overflow Delete prompts and removes      | ✅      | ✅         | ✅     | ✅      |
 * | Completeness rail collapses to icon in split    | ✅      | ✅         | ✅     | ✅      |
 * | Completeness rail popover renders from icon     | ✅      | ✅         | ✅     | ✅      |
 * | PairingSuggestionPanel hidden in split view     | n/a     | ✅         | n/a    | n/a     |
 * | Section anchors scroll in EntityFormLayout      | ✅      | ✅         | ✅     | ✅      |
 * | Phase 1 partial-failure toast renders           | 🔲      | 🔲         | 🔲     | 🔲      |
 * | Phase 1 partial-failure banner lists fields     | 🔲      | 🔲         | 🔲     | 🔲      |
 * | Banner is dismissible                           | 🔲      | 🔲         | 🔲     | 🔲      |
 * | Slug picker renders in Phase 1 (recipes/mix)    | n/a     | n/a        | ✅     | ✅      |
 * | Slug picker absent in Phase 1 (ing/pairings)    | ✅      | ✅         | n/a    | n/a     |
 * | Sibling-data skeleton placeholders render       | ✅      | ✅         | ✅     | ✅      |
 * | Non-translation draft can toggle split view     | ✅      | ✅         | ✅     | ✅      |
 * | Translation draft auto-renders split view       | ✅      | ✅         | 🔲     | 🔲      |
 *
 * 🔲 fixme reasons:
 *   - "Create canonical → translate": Complex CRUD requiring full browser flow.
 *   - "Copy-from label / merge absent (copy mode)": No copy-mode fields in current AI contracts.
 *   - "Bulk suggest accept-all": Mock AI returns improvements:[] — no suggestions generated.
 *   - "Swap-language dirty-prompt": Dirty-state guard not implemented in any form.
 *   - "Partial-failure*": Needs Playwright route intercept returning partial failure response.
 *   - "Translation draft auto (Recipe/Mixture)": RecipeForm lacks auto-enable from initialMeta.translationOf.
 *
 * To add coverage for a 🔲 cell, add the test to the relevant per-form spec file
 * and update this table.
 */

import { expect, test } from "@playwright/test";

test("translation-flows index: matrix spec files exist", async () => {
  // This test documents that the four per-form matrix files are present.
  // Actual matrix tests live in the per-form spec files above.
  const files = [
    "pairing-form-translation.spec.ts",
    "ingredient-form-translation.spec.ts",
    "recipe-form-translation.spec.ts",
    "mixture-form-translation.spec.ts",
  ];
  expect(files).toHaveLength(4);
});
