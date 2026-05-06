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
  const run = (bin, args) => {
    const result = spawnSync(bin, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`pagefind exited with status ${result.status}: ${args.join(" ")}`);
    }
  };
  return {
    name: "pagefind-build",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const siteDir = fileURLToPath(dir);
        const pagefindBin = join(__dirname, "node_modules", ".bin", "pagefind");

        // EN index — all pages (primary index)
        run(pagefindBin, ["--site", siteDir, "--output-path", join(siteDir, "pagefind", "en")]);

        // DE-only index — pages under de/
        run(pagefindBin, [
          "--site",
          siteDir,
          "--glob",
          "de/**/*.html",
          "--output-path",
          join(siteDir, "pagefind", "de"),
        ]);
      },
    },
  };
}

// Workaround: Astro 6.2's astro:dev-toolbar plugin registers a deprecated
// optimizeDeps.esbuildOptions plugin whose onEnd hook reads `result.metafile`.
// Vite+ shims that into rolldown but feeds the hook a Proxy that throws on any
// property access, killing dep optimization. The plugin only strips a sourcemap
// comment from the toolbar entrypoint, so dropping it is safe.
function dropAstroToolbarEsbuildPlugin() {
  const NAME = "astro:strip-toolbar-sourcemap";
  return {
    name: "drop-astro-toolbar-esbuild-plugin",
    configResolved(config) {
      const ep = config.optimizeDeps?.esbuildOptions?.plugins;
      if (Array.isArray(ep)) {
        config.optimizeDeps.esbuildOptions.plugins = ep.filter((p) => p?.name !== NAME);
      }
      const rp = config.optimizeDeps?.rolldownOptions?.plugins;
      if (Array.isArray(rp)) {
        config.optimizeDeps.rolldownOptions.plugins = rp.filter((p) => p?.name !== NAME);
      }
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
    plugins: [tailwindcss(), dropAstroToolbarEsbuildPlugin()],
    resolve: {
      alias: { "@": "/src" },
    },
  },
});
