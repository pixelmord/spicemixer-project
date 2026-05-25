import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = join(__dirname, "..", "..");
const SRC_CONTENT = join(WEBSITE_ROOT, "src/content");
const FIXTURE_OVERLAY = join(WEBSITE_ROOT, "e2e/fixtures/content-overlay");
const E2E_CONTENT_ROOT = join(WEBSITE_ROOT, "e2e/.tmp/content");

/**
 * Seeds the e2e content root before Playwright starts the webServer.
 *
 * Public detail pages are prerendered from `src/content/` at build time, so
 * those tests use real committed content. Admin routes are SSR and read via
 * `LocalFsStore`, which honors `CONTENT_ROOT`. We copy the full content tree
 * into the tmp dir so admin lists are populated and CRUD tests can edit
 * existing entities without polluting the working copy.
 *
 * Two-layer seed:
 *   1. `src/content/`          → production snapshot.
 *   2. `e2e/fixtures/content-overlay/` → test-only files overwriting the
 *      snapshot. See `content-overlay/README.md` for the contract.
 */
export default async function globalSetup(): Promise<void> {
  await rm(E2E_CONTENT_ROOT, { recursive: true, force: true });
  await mkdir(dirname(E2E_CONTENT_ROOT), { recursive: true });
  await cp(SRC_CONTENT, E2E_CONTENT_ROOT, { recursive: true });
  if (existsSync(FIXTURE_OVERLAY)) {
    await cp(FIXTURE_OVERLAY, E2E_CONTENT_ROOT, {
      recursive: true,
      force: true,
      filter: (src) => !src.endsWith("README.md"),
    });
    // eslint-disable-next-line no-console
    console.log(`[e2e] applied content overlay → ${FIXTURE_OVERLAY}`);
  }
  // eslint-disable-next-line no-console
  console.log(`[e2e] seeded content root → ${E2E_CONTENT_ROOT}`);
}
