import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const E2E_TMP = join(__dirname, "..", ".tmp");

export default async function globalTeardown(): Promise<void> {
  if (process.env.KEEP_E2E_FIXTURES === "1") return;
  await rm(E2E_TMP, { recursive: true, force: true });
}
