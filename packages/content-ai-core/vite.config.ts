import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      server: "src/server.ts",
      "presentation/index": "src/presentation/index.ts",
      "testing/index": "src/testing/index.ts",
    },
    dts: true,
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
      exclude: [
        "src/index.ts",
        "src/server.ts",
        "src/presentation/index.ts",
        "src/testing/index.ts",
      ],
      reporter: ["text", "html"],
    },
    globals: false,
  },
});
