import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

/**
 * Regression guard for the `getItem` action's collection enum.
 *
 * `getSiblingEntity({ kind: "pairing" })` calls `actions.getItem({ collection: "pairings" })`.
 * If "pairings" is absent from the enum, Zod validation silently rejects the call,
 * `siblingLocaleData` stays null, and `FieldWithSibling` shows "—" instead of the
 * sibling locale's description text in split view.
 */

const WEBSITE_ROOT = fileURLToPath(new URL("..", import.meta.url));

let actionsSrc: string;

beforeAll(async () => {
  actionsSrc = await readFile(join(WEBSITE_ROOT, "src", "actions", "index.ts"), "utf-8");
});

describe("getItem action — pairings support (split-view sibling description)", () => {
  test('collection enum in getItem includes "pairings"', () => {
    // getSiblingEntity passes collection: "pairings" to this action.
    // Without "pairings" in the enum, Zod rejects the call and sibling data is never
    // loaded, causing Description (EN) to show "—" when editing a DE pairing in split view.
    expect(actionsSrc).toMatch(/"pairings"/);
  });

  test('getItem z.enum includes "pairings" alongside the other collections', () => {
    // Specifically check within the getItem block — not just anywhere in the file.
    // The enum should read: z.enum(["recipes", "mixtures", "ingredients", "meta", "pairings"])
    expect(actionsSrc).toMatch(/getItem[\s\S]{0,300}z\.enum\([^)]*"pairings"/);
  });
});
