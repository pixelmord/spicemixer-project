import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { fileURLToPath, URL } from "node:url";

const sharedAlias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: sharedAlias,
    // Avoid duplicate React copies between pre-bundled deps and tests.
    dedupe: ["react", "react-dom"],
  },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias: sharedAlias, dedupe: ["react", "react-dom"] },
        test: {
          name: "browser",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: !!process.env.CI,
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          globals: true,
        },
      },
    ],
  },
});
