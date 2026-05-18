import type { ConsoleMessage, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Attaches listeners to a page that fail the current test on any uncaught
 * exception or console.error. Call before navigation so events from the
 * initial load are captured.
 *
 * Some console errors are noise (third-party scripts, dev warnings). Pass
 * `ignore` substrings to filter them out.
 */
export function watchForErrors(
  page: Page,
  opts: { ignore?: string[] } = {},
): {
  errors: string[];
  consoleErrors: string[];
} {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const ignore = opts.ignore ?? [];

  page.on("pageerror", (err) => {
    errors.push(`${err.name}: ${err.message}`);
  });
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (ignore.some((needle) => text.includes(needle))) return;
    consoleErrors.push(text);
  });

  return { errors, consoleErrors };
}

/**
 * Visits `url`, asserts a 200 response, and verifies the runtime watchers
 * recorded no uncaught errors or console errors. Returns the navigation
 * response for further assertions.
 */
export async function visitWithoutErrors(
  page: Page,
  url: string,
  opts: { ignore?: string[] } = {},
): Promise<Response | null> {
  const { errors, consoleErrors } = watchForErrors(page, opts);
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });

  expect(response, `no response for ${url}`).not.toBeNull();
  expect(response!.status(), `expected 200 for ${url}`).toBe(200);

  // Astro's standard error overlay element only appears on dev runtime errors;
  // in preview mode SSR errors render as a 500 page. Assert neither shape leaked.
  await expect(page.locator("astro-dev-toolbar")).toHaveCount(0);

  // Give async errors a brief window to surface.
  await page.waitForTimeout(50);

  expect(errors, `uncaught errors on ${url}`).toEqual([]);
  expect(consoleErrors, `console errors on ${url}`).toEqual([]);

  return response;
}
