import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "static",

  // Node adapter enables on-demand rendering for /admin/* routes in dev.
  // Requires @astrojs/node@10.x (Astro 6 compatible).
  adapter: node({ mode: "standalone" }),

  integrations: [react()],

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
