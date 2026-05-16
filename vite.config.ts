import { defineConfig } from "vite-plus";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/website/src", import.meta.url)),
      "content-ai": fileURLToPath(new URL("./packages/content-ai/src/index.ts", import.meta.url)),
      "content-ai-ingest": fileURLToPath(
        new URL("./packages/content-ai-ingest/src/index.ts", import.meta.url),
      ),
      "entity-kind": fileURLToPath(new URL("./packages/entity-kind/src/index.ts", import.meta.url)),
      "recipe-ingestion": fileURLToPath(
        new URL("./packages/recipe-ingestion/src/index.ts", import.meta.url),
      ),
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  run: {
    cache: true,
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/.sandcastle/worktrees/**",
    ],
  },
});
