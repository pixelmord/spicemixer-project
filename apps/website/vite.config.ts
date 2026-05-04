import { defineConfig } from "vite-plus";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "content-ai": fileURLToPath(
        new URL("../../packages/content-ai/src/index.ts", import.meta.url),
      ),
      "recipe-ingestion": fileURLToPath(
        new URL("../../packages/recipe-ingestion/src/index.ts", import.meta.url),
      ),
    },
  },
});
