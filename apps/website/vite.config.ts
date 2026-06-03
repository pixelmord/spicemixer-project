import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { fileURLToPath, URL } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sharedAlias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@registry": join(__dirname, "../registry/src"),
  // Astro virtual modules don't exist outside an Astro build. Stub them so
  // Vitest can resolve any transitive import; tests that hit actions should
  // mock specific handlers via vi.mock("astro:actions", …).
  "astro:actions": join(__dirname, "./tests/stubs/astro-actions.ts"),
  "@pixelmord/content-ai-ingest": join(__dirname, "../../packages/content-ai-ingest/src/index.ts"),
  "@pixelmord/content-ai-refine": join(__dirname, "../../packages/content-ai-refine/src/index.ts"),
  "@pixelmord/content-ai-core/server": join(
    __dirname,
    "../../packages/content-ai-core/src/server.ts",
  ),
  "@pixelmord/content-ai-core/testing": join(
    __dirname,
    "../../packages/content-ai-core/src/testing/index.ts",
  ),
  "@pixelmord/content-ai-core": join(__dirname, "../../packages/content-ai-core/src/index.ts"),
};

export default defineConfig({
  resolve: {
    alias: sharedAlias,
    dedupe: ["react", "react-dom"],
  },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias: sharedAlias, dedupe: ["react", "react-dom"] },
        optimizeDeps: {
          // Pre-bundle React + commonly-touched libs to avoid Vite reloads
          // mid-test on cold runs. Browser-mode discovery is incremental;
          // anything imported transitively by a section/atom must be listed.
          include: [
            "react",
            "react-dom",
            "react-dom/client",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "@base-ui/react/dialog",
            "@base-ui/react/input",
            "@base-ui/react/select",
            "lucide-react",
            "sonner",
            "clsx",
            "class-variance-authority",
            "tailwind-merge",
          ],
        },
        test: {
          name: "browser",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: !!process.env.CI,
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          globals: true,
        },
      },
    ],
  },
});
