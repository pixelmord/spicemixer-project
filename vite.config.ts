import { defineConfig } from "vite-plus";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/website/src", import.meta.url)),
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
      "@pixelmord/content-ai-core/server": fileURLToPath(
        new URL("./packages/content-ai-core/src/server.ts", import.meta.url),
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
  lint: {
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**/*.ts", "**/tests/**/*.tsx"],
        rules: {
          // Vitest pattern: expect(mock.method).toHaveBeenCalled() — safe, no `this` binding issue
          "typescript/unbound-method": "off",
          // Vitest assertion pattern: (item?.data as X)["key"] — intentional
          "no-unsafe-optional-chaining": "off",
        },
      },
      {
        files: ["apps/registry/src/components/**"],
        rules: {
          // Methods from useCallback hooks passed as props — `this` never applies
          "typescript/unbound-method": "off",
          // Display components rendering unknown-typed field values via String()
          "typescript/no-base-to-string": "off",
        },
      },
      {
        files: ["apps/website/src/components/admin/PairingForm.tsx", ".sandcastle/**"],
        rules: {
          // Form field values / error objects: String() cast is intentional
          "typescript/no-base-to-string": "off",
        },
      },
    ],
  },
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
