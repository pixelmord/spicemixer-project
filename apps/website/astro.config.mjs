import { defineConfig } from "astro/config";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Run pagefind to build per-locale search indexes after the Astro build. */
function pagefindIntegration() {
  return {
    name: "pagefind-build",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const siteDir = fileURLToPath(dir);
        const pagefindBin = join(__dirname, "node_modules", ".bin", "pagefind");

        // EN index — all pages (primary index)
        spawnSync(
          pagefindBin,
          ["--site", siteDir, "--output-path", join(siteDir, "pagefind", "en")],
          { stdio: "inherit" },
        );

        // DE-only index — pages under de/
        spawnSync(
          pagefindBin,
          [
            "--site",
            siteDir,
            "--glob",
            "de/**/*.html",
            "--output-path",
            join(siteDir, "pagefind", "de"),
          ],
          { stdio: "inherit" },
        );
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: "static",

  // Node adapter enables on-demand rendering for /admin/* routes in dev.
  // Requires @astrojs/node@10.x (Astro 6 compatible).
  adapter: node({ mode: "standalone" }),

  integrations: [react(), pagefindIntegration()],

  i18n: {
    defaultLocale: "en",
    locales: ["en", "de"],
    routing: {
      prefixDefaultLocale: false,
      excludeDefaultLocale: false,
    },
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { "@": "/src" },
    },
  },
});
