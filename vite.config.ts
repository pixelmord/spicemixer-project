import { defineConfig } from "vite-plus";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/website/src", import.meta.url)),
      "content-ai": fileURLToPath(new URL("./packages/content-ai/src/index.ts", import.meta.url)),
      "@pixelmord/content-ai-ingest": fileURLToPath(
        new URL("./packages/content-ai-ingest/src/index.ts", import.meta.url),
      ),
      "@pixelmord/content-ai-refine": fileURLToPath(
        new URL("./packages/content-ai-refine/src/index.ts", import.meta.url),
      ),
      // Subpath aliases must come BEFORE base aliases — Vite matches keys in
      // insertion order, so listing `@pixelmord/content-ai-core` first would
      // shadow `@pixelmord/content-ai-core/testing` etc.
      "@pixelmord/content-ai-core/presentation": fileURLToPath(
        new URL("./packages/content-ai-core/src/presentation/index.ts", import.meta.url),
      ),
      "@pixelmord/content-ai-core/testing": fileURLToPath(
        new URL("./packages/content-ai-core/src/testing/index.ts", import.meta.url),
      ),
      "@pixelmord/content-ai-core": fileURLToPath(
        new URL("./packages/content-ai-core/src/index.ts", import.meta.url),
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
    tasks: {
      "validate-content": {
        command: "node --experimental-strip-types scripts/validate-content.ts",
        cwd: "apps/website",
        input: ["apps/website/src/content/**", "apps/website/src/lib/content-validators.ts"],
      },
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/.sandcastle/worktrees/**",
      "**/e2e/**",
    ],
  },
});
