import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const COMPONENTS = join(
  fileURLToPath(new URL("..", import.meta.url)),
  "src",
  "components",
  "admin",
);

describe("Translation companion shims — cleanup (issue #154)", () => {
  test.each(["TranslationCompanion.tsx", "AiSuggestionsIndicator.tsx", "SuggestionsOptions.tsx"])(
    "%s is deleted",
    async (file) => {
      await expect(access(join(COMPONENTS, file))).rejects.toThrow();
    },
  );
});
