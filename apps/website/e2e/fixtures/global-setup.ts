import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = join(__dirname, "..", "..");
const SRC_CONTENT = join(WEBSITE_ROOT, "src/content");
const E2E_CONTENT_ROOT = join(WEBSITE_ROOT, "e2e/.tmp/content");

/**
 * Seeds the e2e content root before Playwright starts the webServer.
 *
 * Public detail pages are prerendered from `src/content/` at build time, so
 * those tests use real committed content. Admin routes are SSR and read via
 * `LocalFsStore`, which honors `CONTENT_ROOT`. We copy the full content tree
 * into the tmp dir so admin lists are populated and CRUD tests can edit
 * existing entities without polluting the working copy.
 */
export default async function globalSetup(): Promise<void> {
  await rm(E2E_CONTENT_ROOT, { recursive: true, force: true });
  await mkdir(dirname(E2E_CONTENT_ROOT), { recursive: true });
  await cp(SRC_CONTENT, E2E_CONTENT_ROOT, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`[e2e] seeded content root → ${E2E_CONTENT_ROOT}`);
}
