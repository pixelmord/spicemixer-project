import { defineConfig } from "vite-plus";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "content-ai": path.resolve("../content-ai/src/index.ts"),
      "@pixelmord/content-ai-ingest": path.resolve("../content-ai-ingest/src/index.ts"),
      "recipe-ingestion": path.resolve("../recipe-ingestion/src/index.ts"),
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
