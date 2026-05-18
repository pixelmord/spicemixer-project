import { defineConfig } from "vite-plus";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@pixelmord/content-ai-ingest": path.resolve("../content-ai-ingest/src/index.ts"),
      // Subpath aliases must come before the base alias (Vite matches in insertion order)
      "@pixelmord/content-ai-core/testing": path.resolve("../content-ai-core/src/testing/index.ts"),
      "@pixelmord/content-ai-core": path.resolve("../content-ai-core/src/index.ts"),
    },
  },
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      reporter: ["text", "html"],
    },
    globals: false,
  },
});
