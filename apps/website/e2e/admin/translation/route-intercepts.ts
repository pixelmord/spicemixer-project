import type { Page, Route } from "@playwright/test";
import { stringify as devalueStringify } from "devalue";

/**
 * Playwright route intercepts for Astro Actions.
 *
 * Astro Actions wire format (POST /_actions/<name>):
 *   - Success: status 200, `Content-Type: application/json+devalue`, body is
 *     the action's return value passed through `devalue.stringify`.
 *   - Error:   status 4xx/5xx, `Content-Type: application/json`, body is
 *     `JSON.stringify({ code, message })`.
 *   - Empty:   status 204, no body.
 *
 * Why devalue (not JSON.stringify) for success: the client decodes the body
 * with `devalueParse`, which handles cycles, Date, Map, etc. Plain JSON works
 * for primitives + plain objects but the format is *not* identical — devalue
 * emits an indexed array. See `node_modules/astro/dist/actions/runtime/server.js`.
 *
 * Helpers below install per-test intercepts. They override the real Astro
 * action handler (`/_actions/<name>`) so writes never reach `LocalFsStore`
 * and the mock AI provider isn't invoked.
 *
 * ── Intended consumers ─────────────────────────────────────────────────────
 *
 * The translation matrix has 13 `test.fixme` cells. Route intercepts unblock
 * SOME of them; others need product code first. Audit summary:
 *
 *   Unblocked by intercept alone:
 *     - "Create canonical → translate → land in split view" (×4 forms)
 *       Intercept `aiFillTranslation` (return full suggestions) and
 *       `aiCreate{Ingredient,Pairing,...}Translation`. Use
 *       `context.waitForEvent("page")` to capture the new-tab open.
 *
 *   Need product code first (intercept alone is not enough):
 *     - "Phase 1 partial-failure {toast,banner,dismissible}" (×9)
 *       `TranslateEntityDialog` passes a `failure: { failedFields, errors }`
 *       arg to `onComplete`, but every form's `onComplete` discards it. Add
 *       banner/toast UI in {Ingredient,Pairing,Recipe}Form that reads the arg.
 *     - "Translation draft auto-renders split view" for Recipe/Mixture (×2)
 *       RecipeForm needs `setSplitView(!!initialMeta?.translationOf)` on
 *       mount, matching IngredientForm.
 *     - "Bulk suggest accept-all clears pending count" (×4)
 *       `acceptAll()` requires every suggestion to be marked viewed first
 *       (returns `{ requiresReview }` otherwise). The test must either click
 *       each field card to mark viewed, or the product must add a
 *       "review-and-accept" shortcut. Route intercept supplies the data, but
 *       the interaction model is the blocker.
 *
 *   Out of scope for intercepts (orthogonal blockers):
 *     - "Copy from label / merge absent in copy-mode" — no copy-mode fields
 *       in any current AI contract.
 *     - "Swap-language dirty-prompt" — no dirty-state guard implemented.
 */

export interface ActionInterceptOptions {
  /** Action name as called from the client (e.g. "aiRefreshIngredientSuggestions"). */
  name: string;
  /** Either a fixture response body OR a function that builds one from the request. */
  response: ActionResponse | ((req: { body: unknown }) => ActionResponse);
  /** Optional: how many times the intercept should fire before falling through. */
  times?: number;
}

export type ActionResponse =
  | { kind: "data"; data: unknown }
  | { kind: "error"; status?: number; code: string; message: string }
  | { kind: "empty" };

export async function interceptAction(page: Page, opts: ActionInterceptOptions): Promise<void> {
  let remaining = opts.times ?? Number.POSITIVE_INFINITY;
  await page.route(`**/_actions/${opts.name}`, async (route: Route) => {
    if (remaining <= 0) {
      await route.fallback();
      return;
    }
    remaining -= 1;
    const reqBody = await safeParseJsonBody(route);
    const response =
      typeof opts.response === "function" ? opts.response({ body: reqBody }) : opts.response;
    await fulfill(route, response);
  });
}

async function safeParseJsonBody(route: Route): Promise<unknown> {
  const data = route.request().postData();
  if (!data) return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

async function fulfill(route: Route, response: ActionResponse): Promise<void> {
  if (response.kind === "empty") {
    await route.fulfill({ status: 204 });
    return;
  }
  if (response.kind === "error") {
    await route.fulfill({
      status: response.status ?? 500,
      contentType: "application/json",
      body: JSON.stringify({ code: response.code, message: response.message }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json+devalue",
    body: devalueStringify(response.data, { URL: (v: unknown) => v instanceof URL && v.href }),
  });
}

// ── Common fixture builders ────────────────────────────────────────────────

/** A non-empty AI refresh response that produces one improvement per requested field. */
export function aiRefreshFixture(
  improvements: Array<{ field: string; suggestion: string; rationale?: string }>,
): unknown {
  return {
    aiSuggestions: {
      improvements: improvements.map((i) => ({ rationale: "", ...i })),
      pairings: [],
      tags: [],
      ingredientLinks: [],
    },
    errors: [],
  };
}

/** Partial-failure response for `aiFillTranslation`: some fields filled, others missing. */
export function aiFillPartialFixture(
  filled: Record<string, unknown>,
  missingFields: string[],
): unknown {
  const suggestions: Record<string, { kind: "single"; value: unknown }> = {};
  for (const [field, value] of Object.entries(filled)) {
    suggestions[field] = { kind: "single", value };
  }
  for (const field of missingFields) {
    // Omit on purpose — the dialog reports any translatable field that is
    // *not* in `suggestions` as failed.
    void field;
  }
  return { suggestions };
}
